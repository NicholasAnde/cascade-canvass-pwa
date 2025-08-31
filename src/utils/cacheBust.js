export const cacheBust = (url) => url + (url.includes('?') ? '&' : '?') + 'v=490';
