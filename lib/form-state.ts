// Platform save-feedback contract. A state-returning server action reports the outcome of an
// explicit save so the UI can show SAVE → SAVING… → ✓ CHANGES SAVED / COULD NOT SAVE. `error`
// holds a message on a recoverable failure (the form keeps the user's values); `saved` flips true
// on success. Kept framework-free so both server actions and client components can import it.
export type SaveState = { error: string; saved: boolean };
export const SAVE_IDLE: SaveState = { error: "", saved: false };

// Wrap the body of a state-returning server action: run it, report success, and turn any thrown
// error into a recoverable {error} instead of a crashing/redirecting page. Use inside a
// "use server" action, e.g. `return runSave(() => { ...mutate...; revalidatePath(...); })`.
export async function runSave(work: () => void | Promise<void>): Promise<SaveState> {
  try { await work(); return { error: "", saved: true }; }
  catch (e) { return { error: e instanceof Error && e.message ? e.message : "Could not save changes", saved: false }; }
}
