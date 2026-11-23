# Lyrica foundation docs

These documents describe what Lyrica is, who it is for, what it does and why it is built the way it is. They are the shared starting point for any future work on the app: proposition changes, design system work, UX, architecture, or a public launch.

Last updated: 23 November 2026, at app version 1.4.0.

**Where things stand:** the live app is an MVP and concept, built in a day to test the idea. The proposition, principles and journeys here are the intended direction. The shipped features, design and architecture describe the MVP, not a finished product. A proper design system has not been designed yet.

| Doc | Use it when you are deciding... |
| --- | --- |
| [01 Proposition and principles](01-proposition.md) | What Lyrica is, what it is not, and how to break a tie between two good ideas |
| [02 Users, journeys and stories](02-users-and-journeys.md) | Who a feature is for and which moment of their practice it serves |
| [03 Feature map](03-feature-map.md) | What is shipped, what is next, what is a future idea, and what was rejected and why |
| [04 MVP design notes](04-design-system.md) | What the MVP looks like today and what is actually decided (palette, fonts). A proper design system is future work. |
| [05 Architecture and path to launch](05-architecture-and-launch.md) | How the app is built today and what it would take to become a store app |
| [06 Decision log](06-decision-log.md) | Whether something has already been decided, and on what grounds |

## How to use these in a new chat

- Point Claude at `docs/` in the `lyrica` repo and name the doc that matters most for the task.
- When a decision is made, add a dated line to the [decision log](06-decision-log.md) and update the doc it affects, in the same change. If the feature map or principles drift from the live app, the live app is the truth and the doc should be fixed.
- Open questions are collected at the end of each doc. Resolving one is a decision, so log it.

## The one-paragraph version

Lyrica is a hands-free lyric and chord follower for people playing guitar or piano. You pick a song, set its tempo once, press play, and the words scroll and highlight in time with the real song while the screen stays awake and your hands stay on your instrument. It is a personal app first: free to run, private by design, and built so it could one day become a public product with licensed lyrics and a new name.
