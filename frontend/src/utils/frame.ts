/**
 * True when the app runs inside an iframe, such as a public menu embedded in a bar's website.
 * Comparing the window with `window.top` is allowed even when the parent is another origin.
 */
export function isInFrame(): boolean {
  return window.self !== window.top;
}

/**
 * Target of the links that leave the public pages for the sign-in or the admin. In an iframe
 * they open in the whole tab: nginx only lets the menu be embedded, and a client-side
 * navigation would show the next page inside the frame. Outside a frame, the router navigates.
 */
export function outsideFrameTarget(): '_top' | undefined {
  return isInFrame() ? '_top' : undefined;
}
