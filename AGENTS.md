# PlayLink agent instructions

## Project context
- This repository is an Expo Router app built with React Native and TypeScript.
- The main screens live in [src/app](src/app); route files there are the source of truth for navigation and screen behavior.
- Shared domain logic should live in [src/utils](src/utils), while app data models and seeded data live in [src/data](src/data).
- Before changing Expo or routing behavior, read the versioned Expo docs at https://docs.expo.dev/versions/v56.0.0/.

## Working conventions
- Prefer small, focused changes that fit the existing React Native patterns instead of introducing new libraries or architecture.
- Keep screen components simple and use the current StyleSheet-based styling approach already used in [src/app](src/app).
- Preserve the existing navigation flow in the onboarding and browse screens; route params and screen names should remain consistent.
- When modifying group-related logic, keep the types from [src/data/groups.ts](src/data/groups.ts) intact and update tests in [src/utils/group-utils.test.ts](src/utils/group-utils.test.ts) when behavior changes.
- Avoid editing the starter example content in [example](example) unless the task specifically requires it.
- Whenever code or documentation is written or updated, use the specific prompt in [docs/documentation-prompt.txt](docs/documentation-prompt.txt) as the required documentation workflow.

## Commands
- Install dependencies: npm install
- Start the app: npm start or npx expo start
- Run unit tests: npm test
- Run linting: npm run lint

## Helpful references
- Setup and project overview: [README.md](README.md)
- Data and utility helpers: [src/data/groups.ts](src/data/groups.ts) and [src/utils/group-utils.ts](src/utils/group-utils.ts)
