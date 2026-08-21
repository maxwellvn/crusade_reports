import test from "node:test";
import assert from "node:assert/strict";
import { calculateKeyboardInset, needsKeyboardReveal } from "./keyboardViewport.js";

test("keyboard inset follows the visual viewport only while a form control is focused", () => {
  assert.equal(calculateKeyboardInset({ innerHeight: 844, viewportHeight: 500, offsetTop: 0, focused: true }), 344);
  assert.equal(calculateKeyboardInset({ innerHeight: 844, viewportHeight: 500, offsetTop: 0, focused: false }), 0);
  assert.equal(calculateKeyboardInset({ innerHeight: 700, viewportHeight: 700, offsetTop: 0, focused: true }), 0);
});

test("focused controls are revealed above the keyboard action area", () => {
  const visibleViewport = { top: 0, height: 500, actionBarHeight: 72, margin: 16 };
  assert.equal(needsKeyboardReveal({ top: 390, bottom: 440 }, visibleViewport), true);
  assert.equal(needsKeyboardReveal({ top: 180, bottom: 220 }, visibleViewport), false);
  assert.equal(needsKeyboardReveal({ top: -4, bottom: 36 }, visibleViewport), true);
});
