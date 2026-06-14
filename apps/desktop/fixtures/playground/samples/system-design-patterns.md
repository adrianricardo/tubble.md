# System Design Patterns

Useful patterns to reference while testing editor and sidebar behavior. Related notes: [[effective-learning-techniques]] and [[../project-ideas]].

## Event Sourcing

Store changes as immutable events and derive current state from the event log.

## CQRS

Separate **write models** from *read models* when workloads and data shapes diverge. Keep `query` paths boring.

## Backpressure

Slow producers or shed work when downstream systems cannot keep up.
