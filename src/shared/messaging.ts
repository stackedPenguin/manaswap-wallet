import type { ManaswapMessage } from './types';

export function sendMessage<T = unknown>(message: ManaswapMessage): Promise<T> {
  if (!chrome?.runtime?.sendMessage) {
    return Promise.reject(new Error('Chrome runtime messaging unavailable'));
  }

  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(message, (response) => {
      const error = chrome.runtime.lastError;
      if (error) {
        reject(error);
        return;
      }
      resolve(response as T);
    });
  });
}
