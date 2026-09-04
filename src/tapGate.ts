export interface PointerContact {
  pointerId: number;
  isPrimary?: boolean;
  button: number;
}

/** Each finger is independent. One activation per contact, with no primary-pointer lock. */
export class TapGate {
  private contacts = new Map<number, { claimed: boolean; native: boolean }>();

  // Observe all pointerdown events at window capture, before target handlers.
  down(event: PointerContact) {
    if (event.button !== 0 || this.contacts.has(event.pointerId)) return;
    this.contacts.set(event.pointerId, { claimed: false, native: false });
  }

  claim(id: number, native = false) {
    const contact = this.contacts.get(id);
    if (!contact || contact.claimed) return false;
    contact.claimed = true;
    contact.native = native;
    return true;
  }

  /** True only for a claimed native contact, whose gameplay settles after release. */
  up(id: number) {
    const contact = this.contacts.get(id);
    this.contacts.delete(id);
    return !!contact?.claimed && contact.native;
  }

  cancel(id: number) {
    this.contacts.delete(id);
  }

  lostCapture(id: number) {
    // If this follows pointerup, the contact is already gone. Otherwise cancel this finger only.
    this.cancel(id);
  }

  canKeyboardActivate() {
    return true;
  }

  reset() {
    this.contacts.clear();
  }
}
