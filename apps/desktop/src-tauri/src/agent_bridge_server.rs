use std::{
    collections::HashMap,
    sync::{
        atomic::{AtomicU64, Ordering},
        mpsc, Arc, Mutex,
    },
    thread,
    time::Duration,
};

use serde_json::{json, Value};
use tauri::{AppHandle, Emitter};

const BRIDGE_PORT: u16 = 18790;
const REQUEST_TIMEOUT: Duration = Duration::from_secs(10);

#[derive(Clone, serde::Serialize)]
struct BridgeRequest {
    id: u64,
    method: String,
    payload: Value,
}

pub struct AgentBridgeState {
    pending: Mutex<HashMap<u64, mpsc::SyncSender<Value>>>,
    next_id: AtomicU64,
}

impl AgentBridgeState {
    pub fn new() -> Self {
        Self {
            pending: Mutex::new(HashMap::new()),
            next_id: AtomicU64::new(1),
        }
    }

    pub fn resolve(&self, id: u64, result: Value) {
        if let Some(tx) = self.pending.lock().ok().and_then(|mut m| m.remove(&id)) {
            let _ = tx.send(result);
        }
    }

    fn request(&self, app: &AppHandle, method: &str, payload: Value) -> Result<Value, String> {
        let id = self.next_id.fetch_add(1, Ordering::Relaxed);
        let (tx, rx) = mpsc::sync_channel(1);

        if let Ok(mut map) = self.pending.lock() {
            map.insert(id, tx);
        }

        let req = BridgeRequest {
            id,
            method: method.to_string(),
            payload,
        };

        app.emit("hubble://agent-bridge-request", &req)
            .map_err(|e| format!("emit failed: {e}"))?;

        rx.recv_timeout(REQUEST_TIMEOUT).map_err(|_| {
            if let Ok(mut map) = self.pending.lock() {
                map.remove(&id);
            }
            "bridge request timed out".to_string()
        })
    }
}

pub fn start(app_handle: AppHandle, state: Arc<AgentBridgeState>) {
    thread::spawn(move || {
        let addr = format!("0.0.0.0:{BRIDGE_PORT}");
        let server = match tiny_http::Server::http(&addr) {
            Ok(s) => {
                eprintln!("[hubble bridge] listening on http://{addr}");
                s
            }
            Err(e) => {
                eprintln!("[hubble bridge] failed to bind {addr}: {e}");
                return;
            }
        };

        for mut request in server.incoming_requests() {
            let method = request.method().to_string();
            let path = request.url().split('?').next().unwrap_or("").to_string();

            let mut body = String::new();
            if let Err(e) = request.as_reader().read_to_string(&mut body) {
                let _ = respond_json(request, 400, json!({"ok": false, "error": format!("bad body: {e}")}));
                continue;
            }

            let result = route(&method, &path, &body, &app_handle, &state);

            match result {
                Ok((status, value)) => {
                    let _ = respond_json(request, status, value);
                }
                Err(msg) => {
                    let _ = respond_json(request, 500, json!({"ok": false, "error": msg}));
                }
            }
        }
    });
}

fn route(
    method: &str,
    path: &str,
    body: &str,
    app: &AppHandle,
    state: &AgentBridgeState,
) -> Result<(u16, Value), String> {
    match (method, path) {
        ("GET", "/health") => Ok((200, json!({"ok": true}))),

        ("GET", "/state") => {
            let result = state.request(app, "get_state", Value::Null)?;
            Ok((200, json!({"ok": true, "result": result})))
        }

        ("GET", "/snapshot") => {
            let result = state.request(app, "get_snapshot", Value::Null)?;
            Ok((200, json!({"ok": true, "result": result})))
        }

        ("POST", "/edit") => {
            let payload: Value =
                serde_json::from_str(body).map_err(|e| format!("invalid JSON: {e}"))?;
            let result = state.request(app, "apply_edit", payload)?;
            let ok = result.get("success") == Some(&Value::Bool(true));
            Ok((if ok { 200 } else { 409 }, json!({"ok": ok, "result": result})))
        }

        ("POST", "/presence") => {
            let payload: Value =
                serde_json::from_str(body).map_err(|e| format!("invalid JSON: {e}"))?;
            let result = state.request(app, "set_presence", payload)?;
            Ok((200, json!({"ok": true, "result": result})))
        }

        ("DELETE", "/presence") => {
            let _ = state.request(app, "clear_presence", Value::Null)?;
            Ok((200, json!({"ok": true})))
        }

        _ => Ok((404, json!({"ok": false, "error": "not found"}))),
    }
}

fn respond_json(
    request: tiny_http::Request,
    status: u16,
    value: Value,
) -> Result<(), ()> {
    let body = serde_json::to_string(&value).unwrap_or_default();
    let response = tiny_http::Response::from_string(&body)
        .with_status_code(tiny_http::StatusCode(status))
        .with_header(
            "Content-Type: application/json"
                .parse::<tiny_http::Header>()
                .unwrap(),
        )
        .with_header(
            "Access-Control-Allow-Origin: *"
                .parse::<tiny_http::Header>()
                .unwrap(),
        )
        .with_header(
            "Access-Control-Allow-Methods: GET, POST, DELETE, OPTIONS"
                .parse::<tiny_http::Header>()
                .unwrap(),
        )
        .with_header(
            "Access-Control-Allow-Headers: Content-Type, Authorization"
                .parse::<tiny_http::Header>()
                .unwrap(),
        );
    request.respond(response).map_err(|_| ())
}
