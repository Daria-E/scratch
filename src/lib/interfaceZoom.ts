interface ZoomRoot {
  style: {
    removeProperty(property: string): string;
  };
}

interface ZoomWebview {
  setZoom(zoom: number): Promise<void>;
}

export async function applyInterfaceZoom(
  zoom: number,
  root: ZoomRoot,
  webview: ZoomWebview,
): Promise<void> {
  root.style.removeProperty("zoom");
  await webview.setZoom(zoom);
}
