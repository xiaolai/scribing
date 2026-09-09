# Agent coordination

## Communication

- Address the user as Xiaolai.
- Use English unless Xiaolai specifically requests another language.

## 1. Lead and decisions

- The lead uses `gpt-6-astra` with `ultra` reasoning.
- The lead owns planning, discussion, debate, final decisions, acceptance
  criteria, and auditing.

## 2. Independent debate

- Assign a dedicated debate agent to challenge assumptions, alternatives,
  risks, and acceptance criteria; the lead chooses its model and effort.
- Keep debate separate from implementation. An agent cannot certify its own
  changes as an independent audit.

## 3. Implementation delegation

- Delegate bounded, routine implementation to `gpt-6-astra` with `medium`
  reasoning, and complex or cross-cutting implementation with `high` reasoning.
- The lead chooses the implementation effort according to task complexity.

## 4. Acceptance loop

- Define explicit acceptance criteria before implementation.
- Review and debate the plan, let the lead decide, implement, then audit.
- Delegate specific fixes and re-audit; repeat until the criteria are verified.
- Do not declare completion with unresolved findings. If externally blocked,
  state the blocker and the remaining acceptance criteria clearly.

This file defines policy; it does not change a running agent's model or effort.
Verify the actual model and effort when orchestrating agents. Report unavailable
configurations rather than silently claiming compliance.
