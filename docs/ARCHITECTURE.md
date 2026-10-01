# Architecture

```
VisualCompose (facade)
 ├─ Router            URL → { route, params } → onEnter/onLeave           (no DOM)
 ├─ TemplateRegistry  source → ResolvedTemplate { content, scripts, sourceEl, __vcParent }
 ├─ ApiClient         table(endpoint) → fluent builder → fetch + cache
 ├─ BindingEngine     resolve template → resolve data → clone + map → insert → run scripts
 └─ ScriptLoader      re-creates real <script> tags (no eval, CSP friendly)
```

## Key decisions
1. **Separation of concerns.** The router never renders; the binder never routes. Each is replaceable.
2. **Pristine moulds.** The registry stores the *unrendered* clone; re-binds never clone an already-rendered node.
3. **Consumed mould.** In in-place mode the visible original is hidden synchronously (no flash of un-styled content during `await`), then removed; `__vcParent` remembers where clones go and `__vcStamp` marks them for the next bind.
4. **Cache invalidation by prefix.** A write to `users/:id` invalidates every cached GET under the static prefix `users` (boundary-aware: `users-archive` is untouched).
5. **MPA ≈ SPA.** The only difference is `navigate()` (full load vs `pushState`) and the click interceptor.

## Binding lifecycle
`resolve template → show loading → resolve data → (error | empty | clones) → insert → remove original → run scripts (once | per-clone | never)`
