/**
 * engine.ts
 *
 * Общий проход по FormDefinition: команды, ответы, подтверждение, запись.
 * Модель здесь не вызывается.
 *
 * Структура / что умеет:
 * 1. handleFormTurn — один ход пользователя
 * 2. Команды: отмена, назад, пропустить, дальше, да, нет, редактировать
 * 3. Захват draft до записи, чтобы повторное «Да» не создало вторую запись
 */

import type { DraftStore } from './draftStore.js';
import { MAX_FORM_ANSWER_LENGTH, parseCommand } from './parse.js';
import type {
  AcceptedValue,
  FormDefinition,
  FormDraft,
  FormEngineResult,
  FormHandleInput,
  FormRuntime,
  FormServices,
  FormStep,
  StepDecision,
} from './types.js';
import type { FormRegistry } from './registry.js';

export const CONFIRM_SUGGESTIONS = ['Да', 'Нет', 'Редактировать'];

export interface FormEngineDeps {
  store: DraftStore;
  registry: FormRegistry;
  services: FormServices;
}

export function createEmptyDraft(userId: string, formId: string, now: number, firstStep: string): FormDraft {
  return {
    userId,
    formId,
    values: {},
    filledOrder: [],
    currentStep: firstStep,
    awaitingConfirmation: false,
    choosingEdit: false,
    returnToConfirmation: false,
    updatedAt: now,
    submitting: false,
  };
}

export function trackValue(draft: FormDraft, key: string): void {
  draft.filledOrder = draft.filledOrder.filter((item) => item !== key);
  draft.filledOrder.push(key);
}

export function applyAccepted(draft: FormDraft, values: AcceptedValue[]): void {
  for (const item of values) {
    draft.values[item.key] = item.value;
    if (item.undoable) trackValue(draft, item.key);
  }
}

export function clearKeys(draft: FormDraft, keys: string[]): void {
  for (const key of keys) {
    delete draft.values[key];
    draft.filledOrder = draft.filledOrder.filter((item) => item !== key);
  }
}

function handled(text: string, suggestions?: string[]): FormEngineResult {
  const clean = suggestions?.filter(Boolean);
  return { handled: true, text, suggestions: clean && clean.length > 0 ? clean : undefined };
}

function stepById(form: FormDefinition, stepId: string): FormStep | undefined {
  return form.steps.find((step) => step.id === stepId);
}

function isStepDone(step: FormStep, draft: FormDraft): boolean {
  if (step.isDone?.(draft)) return true;
  return draft.values[step.id] !== undefined;
}

function nextOpenStep(form: FormDefinition, draft: FormDraft): FormStep | undefined {
  return form.steps.find((step) => !isStepDone(step, draft));
}

function resolveEditTarget(form: FormDefinition, target: string): string | null {
  const normalized = target.trim().toLowerCase().replace(/ё/g, 'е');
  for (const step of form.steps) {
    if (step.editPhrases.some((phrase) => phrase === normalized)) return step.id;
    if (step.label.toLowerCase().replace(/ё/g, 'е') === normalized) return step.id;
  }
  return null;
}

function editSuggestions(form: FormDefinition): string[] {
  return form.steps.map((step) => step.label);
}

async function showConfirmation(
  form: FormDefinition,
  draft: FormDraft,
  runtime: FormRuntime,
): Promise<FormEngineResult> {
  draft.awaitingConfirmation = true;
  draft.choosingEdit = false;
  draft.returnToConfirmation = false;
  draft.currentStep = '';
  const card = await form.confirmation(draft, runtime);
  return handled(card.text, card.suggestions ?? CONFIRM_SUGGESTIONS);
}

async function showStep(
  form: FormDefinition,
  draft: FormDraft,
  runtime: FormRuntime,
  step: FormStep,
): Promise<FormEngineResult> {
  draft.awaitingConfirmation = false;
  draft.choosingEdit = false;
  draft.currentStep = step.id;
  const prompt = await step.prompt(draft, runtime);
  return handled(prompt.text, prompt.suggestions);
}

async function present(
  form: FormDefinition,
  draft: FormDraft,
  runtime: FormRuntime,
): Promise<FormEngineResult> {
  if (draft.returnToConfirmation) {
    return showConfirmation(form, draft, runtime);
  }
  const step = nextOpenStep(form, draft);
  if (!step) return showConfirmation(form, draft, runtime);
  return showStep(form, draft, runtime, step);
}

async function reprompt(
  form: FormDefinition,
  draft: FormDraft,
  runtime: FormRuntime,
  message: string,
  suggestions?: string[],
): Promise<FormEngineResult> {
  const step = stepById(form, draft.currentStep) ?? nextOpenStep(form, draft);
  if (!step) return handled(message, suggestions);
  const prompt = await step.prompt(draft, runtime);
  const text = `${message}\n\n${prompt.text}`;
  return handled(text, suggestions ?? prompt.suggestions);
}

function openForEdit(form: FormDefinition, draft: FormDraft, stepId: string, fromConfirmation: boolean): boolean {
  const step = stepById(form, stepId);
  if (!step) return false;
  step.onClear?.(draft);
  delete draft.values[step.id];
  draft.filledOrder = draft.filledOrder.filter((key) => key !== step.id);
  draft.currentStep = step.id;
  draft.awaitingConfirmation = false;
  draft.choosingEdit = false;
  draft.returnToConfirmation = fromConfirmation;
  return true;
}

function undoLast(form: FormDefinition, draft: FormDraft): string | null {
  const key = draft.filledOrder.pop();
  if (!key) return null;
  delete draft.values[key];
  const owner = form.steps.find((step) => step.id === key)
    ?? (key.startsWith('param:') ? stepById(form, 'parameters') : undefined);
  owner?.onClear?.(draft);
  if (key.startsWith('param:')) delete draft.values.parametersDone;
  draft.currentStep = owner?.id ?? form.steps[0]?.id ?? '';
  draft.awaitingConfirmation = false;
  draft.choosingEdit = false;
  draft.returnToConfirmation = false;
  return draft.currentStep;
}

async function applyDecision(
  form: FormDefinition,
  draft: FormDraft,
  runtime: FormRuntime,
  decision: StepDecision,
): Promise<FormEngineResult> {
  if (decision.type === 'invalid') {
    return reprompt(form, draft, runtime, decision.message, decision.suggestions);
  }
  if (decision.type === 'partial') {
    if (decision.clear) clearKeys(draft, decision.clear);
    applyAccepted(draft, decision.values);
    if (decision.stepId) draft.currentStep = decision.stepId;
    draft.awaitingConfirmation = false;
    draft.choosingEdit = false;
    return handled(decision.prompt.text, decision.prompt.suggestions);
  }
  if (decision.type === 'stay') {
    applyAccepted(draft, decision.values);
    draft.awaitingConfirmation = false;
    return handled(decision.prompt.text, decision.prompt.suggestions);
  }
  applyAccepted(draft, decision.values);
  if (decision.stepId) draft.currentStep = decision.stepId;
  return present(form, draft, runtime);
}

async function continueForm(
  form: FormDefinition,
  draft: FormDraft,
  text: string,
  runtime: FormRuntime,
  store: DraftStore,
): Promise<FormEngineResult> {
  const command = parseCommand(text);

  if (draft.submitting && command?.type !== 'cancel') {
    return handled('Запись уже выполняется.');
  }

  if (command?.type === 'cancel') {
    store.delete(draft.userId);
    return handled('Заполнение отменено.');
  }

  if (command?.type === 'yes' && draft.awaitingConfirmation) {
    const claim = store.tryBeginSubmit(draft.userId, runtime.now);
    if (claim === 'busy') return handled('Запись уже выполняется.');
    if (claim === 'missing') return { handled: false };
    try {
      const outcome = await form.submit(claim, runtime);
      if (!outcome.ok) {
        store.abortSubmit(draft.userId, runtime.now);
        claim.awaitingConfirmation = true;
        claim.submitting = false;
        return handled(outcome.text, CONFIRM_SUGGESTIONS);
      }
      store.delete(draft.userId);
      return handled(outcome.text);
    } catch (error) {
      store.abortSubmit(draft.userId, runtime.now);
      claim.submitting = false;
      claim.awaitingConfirmation = true;
      const detail = error instanceof Error ? error.message : 'Не удалось сохранить запись';
      return handled(
        `Не удалось сохранить запись. ${detail}\n\nМожно ещё раз ответить «Да».`,
        CONFIRM_SUGGESTIONS,
      );
    }
  }

  if (command?.type === 'no' && draft.awaitingConfirmation) {
    store.delete(draft.userId);
    return handled('Запись не сохранена.');
  }

  if (command?.type === 'edit-menu' && (draft.awaitingConfirmation || draft.filledOrder.length > 0)) {
    draft.choosingEdit = true;
    draft.awaitingConfirmation = false;
    return handled('Что изменить?', editSuggestions(form));
  }

  if (command?.type === 'edit' || command?.type === 'edit-last') {
    const fromConfirmation = draft.awaitingConfirmation || draft.choosingEdit;
    const target = command.type === 'edit'
      ? resolveEditTarget(form, command.target)
      : lastEditableStep(form, draft);
    if (!target) {
      return handled('Выберите пункт из списка.', editSuggestions(form));
    }
    const step = stepById(form, target);
    if (!step || !openForEdit(form, draft, target, fromConfirmation)) {
      return handled('Выберите пункт из списка.', editSuggestions(form));
    }
    return showStep(form, draft, runtime, step);
  }

  if (draft.choosingEdit && !command) {
    const target = resolveEditTarget(form, text);
    const step = target ? stepById(form, target) : undefined;
    if (!step || !openForEdit(form, draft, step.id, true)) {
      return handled('Выберите пункт из списка.', editSuggestions(form));
    }
    return showStep(form, draft, runtime, step);
  }

  if (command?.type === 'back') {
    const stepId = undoLast(form, draft);
    if (!stepId) return handled('Возвращаться некуда.');
    const step = stepById(form, stepId);
    if (!step) return handled('Возвращаться некуда.');
    return showStep(form, draft, runtime, step);
  }

  if (command?.type === 'skip') {
    const step = stepById(form, draft.currentStep);
    if (!step?.optional || !step.onSkip) {
      return reprompt(form, draft, runtime, 'Этот пункт обязательный, его нельзя пропустить.');
    }
    applyAccepted(draft, step.onSkip(draft));
    return present(form, draft, runtime);
  }

  if (command?.type === 'next') {
    const step = stepById(form, draft.currentStep);
    if (!step?.onNext) {
      return reprompt(form, draft, runtime, 'Команда «Дальше» здесь не используется.');
    }
    step.onNext(draft);
    return present(form, draft, runtime);
  }

  if (draft.awaitingConfirmation) {
    return handled('Ответьте «Да», «Нет» или «Редактировать».', CONFIRM_SUGGESTIONS);
  }

  const answer = text.trim();
  if (!answer) {
    return reprompt(form, draft, runtime, 'Нужен текстовый ответ.');
  }
  if (answer.length > MAX_FORM_ANSWER_LENGTH) {
    return reprompt(
      form,
      draft,
      runtime,
      `Слишком длинный ответ. Сократите текст до ${MAX_FORM_ANSWER_LENGTH} символов.`,
    );
  }

  const decision = await form.interpret(answer, draft, runtime);
  return applyDecision(form, draft, runtime, decision);
}

function lastEditableStep(form: FormDefinition, draft: FormDraft): string | null {
  for (let index = draft.filledOrder.length - 1; index >= 0; index -= 1) {
    const key = draft.filledOrder[index];
    if (key.startsWith('param:')) return 'parameters';
    if (stepById(form, key)) return key;
  }
  return null;
}

async function startForm(
  form: FormDefinition,
  input: FormHandleInput,
  remainder: string,
  runtime: FormRuntime,
  store: DraftStore,
): Promise<FormEngineResult> {
  const draft = createEmptyDraft(input.userId, form.id, runtime.now, form.steps[0]?.id ?? '');
  store.save(draft);
  if (form.prepare) await form.prepare(draft, runtime);
  if (remainder.trim()) {
    if (remainder.trim().length > MAX_FORM_ANSWER_LENGTH) {
      const result = await reprompt(
        form,
        draft,
        runtime,
        `Слишком длинный ответ. Сократите текст до ${MAX_FORM_ANSWER_LENGTH} символов.`,
      );
      draft.updatedAt = runtime.now;
      store.save(draft);
      return result;
    }
    const decision = await form.interpret(remainder, draft, runtime);
    const result = await applyDecision(form, draft, runtime, decision);
    draft.updatedAt = runtime.now;
    if (store.has(input.userId)) store.save(draft);
    return result;
  }
  const result = await present(form, draft, runtime);
  draft.updatedAt = runtime.now;
  store.save(draft);
  return result;
}

export async function handleFormTurn(input: FormHandleInput, deps: FormEngineDeps): Promise<FormEngineResult> {
  const now = input.now ?? Date.now();
  const runtime: FormRuntime = {
    services: deps.services,
    access: input.access,
    equipmentContext: input.equipmentContext,
    now,
    userId: input.userId,
  };
  const lookup = deps.store.peek(input.userId, now);
  if (lookup.expired) return { handled: false };

  if (!lookup.draft) {
    const matched = deps.registry.match(input.text);
    if (!matched) return { handled: false };
    if (!matched.form.isAllowed(input.access)) return { handled: false };
    return startForm(matched.form, input, matched.remainder, runtime, deps.store);
  }

  const form = deps.registry.byId(lookup.draft.formId);
  if (!form) {
    deps.store.delete(input.userId);
    return { handled: false };
  }

  const result = await continueForm(form, lookup.draft, input.text, runtime, deps.store);
  if (deps.store.has(input.userId) && !lookup.draft.submitting) {
    lookup.draft.updatedAt = now;
    deps.store.save(lookup.draft);
  }
  return result;
}
