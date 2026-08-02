import type { KeyboardEvent, RefObject } from "react";

type EnterNextControl = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;

const SKIPPED_INPUT_TYPES = new Set([
  "button",
  "checkbox",
  "file",
  "hidden",
  "image",
  "radio",
  "range",
  "reset",
  "submit",
]);

function isVisible(element: HTMLElement) {
  return element.offsetParent !== null || getComputedStyle(element).position === "fixed";
}

function isEnterNextControl(element: Element): element is EnterNextControl {
  if (
    !(element instanceof HTMLInputElement) &&
    !(element instanceof HTMLSelectElement) &&
    !(element instanceof HTMLTextAreaElement)
  ) {
    return false;
  }
  if (element.dataset.enterNextSkip === "true") return false;
  if (element.disabled) return false;
  if (!isVisible(element)) return false;
  if (element instanceof HTMLInputElement) {
    if (SKIPPED_INPUT_TYPES.has(element.type)) return false;
    if (element.readOnly) return false;
  }
  if (element instanceof HTMLTextAreaElement && element.readOnly) return false;
  return true;
}

function focusControl(control: EnterNextControl | HTMLButtonElement) {
  control.focus({ preventScroll: true });
  if (control instanceof HTMLInputElement || control instanceof HTMLTextAreaElement) {
    control.select();
  }
}

export function handleEnterAsNextField(
  event: KeyboardEvent,
  options: {
    rootRef?: RefObject<HTMLElement>;
    finalButtonRef?: RefObject<HTMLButtonElement>;
  } = {}
) {
  if (event.key !== "Enter") return;
  if (event.altKey || event.ctrlKey || event.metaKey) return;
  if (event.shiftKey && event.target instanceof HTMLTextAreaElement) return;

  const current = event.target;
  if (!(current instanceof Element) || !isEnterNextControl(current)) return;
  if (!current.reportValidity()) return;

  const root =
    options.rootRef?.current ??
    current.form ??
    current.closest("form") ??
    current.closest('[role="dialog"]');
  if (!root) return;

  const controls = Array.from(root.querySelectorAll<Element>("input, select, textarea")).filter(
    isEnterNextControl
  );
  const currentIndex = controls.indexOf(current);
  if (currentIndex < 0) return;

  event.preventDefault();
  event.stopPropagation();

  const nextControl = controls[currentIndex + 1];
  if (nextControl) {
    focusControl(nextControl);
    return;
  }

  const finalButton =
    options.finalButtonRef?.current ??
    current.form?.querySelector<HTMLButtonElement>('button[type="submit"]:not(:disabled)');
  if (finalButton) focusControl(finalButton);
}
