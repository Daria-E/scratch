import { alt, isMac, keyIs, mod, shift, shortcut } from "./platform";

export type MathBindingSet = "primary" | "fallback";

// MAC-1 is the only reason to flip this. Labels and matchers derive from it.
export const ACTIVE_MATH_BINDINGS: MathBindingSet = "primary";

export type MathShortcutAction = "inline-or-toggle" | "block";

export interface KeyboardEventLike {
  metaKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
  key: string;
  code: string;
}

interface MathBinding {
  alt: boolean;
  shift: boolean;
}

const BINDINGS: Record<
  MathBindingSet,
  Record<MathShortcutAction, MathBinding>
> = {
  primary: {
    "inline-or-toggle": { alt: false, shift: false },
    block: { alt: true, shift: false },
  },
  fallback: {
    "inline-or-toggle": { alt: true, shift: false },
    block: { alt: true, shift: true },
  },
};

export function mathShortcutActionForSet(
  e: KeyboardEventLike,
  bindingSet: MathBindingSet,
): MathShortcutAction | null {
  if (!(e.metaKey || e.ctrlKey) || !keyIs(e, "m")) {
    return null;
  }

  const bindings = BINDINGS[bindingSet];
  const actions: MathShortcutAction[] = ["inline-or-toggle", "block"];
  return (
    actions.find(
      (action) =>
        e.altKey === bindings[action].alt &&
        e.shiftKey === bindings[action].shift,
    ) ?? null
  );
}

export function mathShortcutAction(
  e: KeyboardEventLike,
): MathShortcutAction | null {
  return mathShortcutActionForSet(e, ACTIVE_MATH_BINDINGS);
}

function shortcutKeys(action: MathShortcutAction): string[] {
  const binding = BINDINGS[ACTIVE_MATH_BINDINGS][action];

  if (isMac) {
    return [
      ...(binding.shift ? [shift] : []),
      ...(binding.alt ? [alt] : []),
      mod,
      "M",
    ];
  }

  return [
    mod,
    ...(binding.alt ? [alt] : []),
    ...(binding.shift ? [shift] : []),
    "M",
  ];
}

export function inlineMathShortcutKeys(): string[] {
  return shortcutKeys("inline-or-toggle");
}

export function blockMathShortcutKeys(): string[] {
  return shortcutKeys("block");
}

export function inlineMathShortcutLabel(): string {
  return shortcut(...inlineMathShortcutKeys());
}

export function blockMathShortcutLabel(): string {
  return shortcut(...blockMathShortcutKeys());
}
