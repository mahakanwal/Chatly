import { API_URL } from '../config';

let authToken = null;
let onUnauthorized = null;

export function setAuthToken(token) {
  authToken = token;
}

export function setUnauthorizedHandler(handler) {
  onUnauthorized = handler;
}

export class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

async function handle(res) {
  let data = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }
  if (!res.ok) {
    if (res.status === 401 && authToken && onUnauthorized) onUnauthorized();
    throw new ApiError((data && data.message) || `Request failed (${res.status})`, res.status);
  }
  return data;
}

export async function api(path, { method = 'GET', body } = {}) {
  const headers = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (authToken) headers.Authorization = `Bearer ${authToken}`;
  let res;
  try {
    res = await fetch(`${API_URL}/api${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError('No internet connection. Please try again.', 0);
  }
  return handle(res);
}

/**
 * Uploads a local file (uri from image picker / document picker / recorder).
 * file: { uri, name, type }
 */
export async function uploadFile(path, file, fields = {}) {
  const form = new FormData();
  const isWeb = typeof document !== 'undefined' && typeof navigator !== 'undefined' && navigator.product !== 'ReactNative';

  if (isWeb) {
    // Browser: FormData needs a real Blob/File. The { uri, name, type } object only works on Android/iOS.
    let blob;
    try {
      blob = file.file instanceof Blob ? file.file : await (await fetch(file.uri)).blob();
    } catch {
      throw new ApiError('Could not read the selected file.', 0);
    }
    const type = blob.type || file.type || 'application/octet-stream';
    form.append('file', new File([blob], file.name || 'file', { type }));
  } else {
    form.append('file', {
      uri: file.uri,
      name: file.name || 'file',
      type: file.type || 'application/octet-stream',
    });
  }
  Object.entries(fields).forEach(([k, v]) => {
    if (v !== undefined && v !== null) form.append(k, String(v));
  });

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${API_URL}/api${path}`);
    xhr.setRequestHeader('Accept', 'application/json');
    if (authToken) xhr.setRequestHeader('Authorization', `Bearer ${authToken}`);
    xhr.timeout = 120000;

    xhr.onload = () => {
      let data = null;
      try {
        data = JSON.parse(xhr.responseText);
      } catch {
        data = null;
      }
      if (xhr.status >= 200 && xhr.status < 300) return resolve(data);
      if (xhr.status === 401 && authToken && onUnauthorized) onUnauthorized();
      reject(new ApiError((data && data.message) || `Request failed (${xhr.status})`, xhr.status));
    };
    xhr.onerror = () => reject(new ApiError('Upload failed. Check your connection.', 0));
    xhr.ontimeout = () => reject(new ApiError('Upload timed out. Try again.', 0));
    xhr.send(form);
  });
}