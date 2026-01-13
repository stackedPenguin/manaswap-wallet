
export const EXTENSION_WIDTH = 360;
export const EXTENSION_HEIGHT = 600;

export async function getLastFocusedWindow(): Promise<chrome.windows.Window> {
    return new Promise((resolve) => {
        chrome.windows.getLastFocused(resolve);
    });
}

export async function openPopupWindow() {
    const lastWindow = await getLastFocusedWindow();

    const width = EXTENSION_WIDTH;
    const height = EXTENSION_HEIGHT;

    // Add some padding for OS borders (copied from Backpack)
    const [EXTRA_HEIGHT, EXTRA_WIDTH] =
        (navigator as any).userAgentData?.platform === "Windows"
            ? [36, 12]
            : [28, 0];

    const createData: chrome.windows.CreateData = {
        url: chrome.runtime.getURL('src/pages/popup/index.html'),
        type: "popup",
        width: width + EXTRA_WIDTH,
        height: height + EXTRA_HEIGHT,
        focused: true,
    };

    // Position it relative to the last window (top-right usually)
    if (lastWindow && lastWindow.left !== undefined && lastWindow.width !== undefined) {
        createData.top = lastWindow.top;
        createData.left = lastWindow.left + (lastWindow.width - width - EXTRA_WIDTH);
    }

    await chrome.windows.create(createData);
}
