import browser from 'webextension-polyfill';

console.log('[password-manager] content script loaded on', window.location.host);

void browser.runtime.id;
