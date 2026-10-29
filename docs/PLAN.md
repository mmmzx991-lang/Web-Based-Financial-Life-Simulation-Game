# Initial scaffold plan — 29 October 2026

Source: the user's V12.6 CAT404 summary. The complete frozen proposal was not accessible; do not describe this implementation as a full proposal audit.

Use native Node.js HTTP, ES modules, a plain responsive English frontend and the built-in test runner. This keeps setup dependency-free. A framework plus database would add setup before it is needed; a browser-only simulation would not supply the requested backend API.

1. Write boundary tests for four life windows, expense bands, annual salary growth, fixed retirement, monthly settlement and three-month equivalence.
2. Implement isolated configuration, market and simulation modules. Use integer sen for cash and prices.
3. Add HTTP routes for new games, advance, trade, save/load and reports; add integration tests including independent sessions and malformed requests.
4. Build a responsive dashboard with mode selection, cashflow, asset list, advance controls and explicit placeholders for future systems.
5. Document API, assumptions and unimplemented scope. Run tests and syntax checks, review repository contents, then create a private repository and push main.

The user has already authorized the implementation and direct private push. No additional design approval is required. Approximately 20 independent players is a design target, not a measured capacity claim.
