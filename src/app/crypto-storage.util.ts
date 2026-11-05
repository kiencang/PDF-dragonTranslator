const DB_NAME = 'secure_key_db';
const STORE_NAME = 'crypto_keys';
const KEY_ID = 'aes_gcm_master_key';

const ENCRYPTED_KEY_STORAGE = 'encrypted_api_key';
const IV_STORAGE = 'api_key_iv';
const LEGACY_KEYS = ['sila_pdf_translator_user_api_key', 'user_gemini_api_key'];

function isBrowserSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof localStorage !== 'undefined' &&
    typeof indexedDB !== 'undefined' &&
    typeof crypto !== 'undefined' &&
    !!crypto.subtle
  );
}

function uint8ToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToUint8(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function openKeyDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };

    request.onsuccess = (event) => {
      resolve((event.target as IDBOpenDBRequest).result);
    };

    request.onerror = (event) => {
      reject((event.target as IDBOpenDBRequest).error);
    };
  });
}

async function getStoredCryptoKey(): Promise<CryptoKey | null> {
  const db = await openKeyDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const req = store.get(KEY_ID);

    req.onsuccess = () => {
      db.close();
      resolve((req.result as CryptoKey) || null);
    };
    req.onerror = () => {
      db.close();
      reject(req.error);
    };
  });
}

async function storeCryptoKey(key: CryptoKey): Promise<void> {
  const db = await openKeyDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const req = store.put(key, KEY_ID);

    req.onsuccess = () => {
      db.close();
      resolve();
    };
    req.onerror = () => {
      db.close();
      reject(req.error);
    };
  });
}

async function getOrCreateCryptoKey(): Promise<CryptoKey> {
  const existingKey = await getStoredCryptoKey();
  if (existingKey) {
    return existingKey;
  }

  const newKey = await crypto.subtle.generateKey(
    {
      name: 'AES-GCM',
      length: 256,
    },
    false, // extractable: false — khóa chặt trong nhân bảo mật của trình duyệt
    ['encrypt', 'decrypt']
  );

  await storeCryptoKey(newKey);
  return newKey;
}

export async function removeSecureApiKey(): Promise<void> {
  if (typeof localStorage !== 'undefined') {
    localStorage.removeItem(ENCRYPTED_KEY_STORAGE);
    localStorage.removeItem(IV_STORAGE);
    for (const legacyKey of LEGACY_KEYS) {
      localStorage.removeItem(legacyKey);
    }
  }

  if (typeof indexedDB !== 'undefined') {
    try {
      const db = await openKeyDb();
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        const req = store.delete(KEY_ID);
        req.onsuccess = () => {
          db.close();
          resolve();
        };
        req.onerror = () => {
          db.close();
          reject(req.error);
        };
      });
    } catch {
      // Bỏ qua lỗi khi xóa DB
    }
  }
}

export async function saveSecureApiKey(apiKey: string): Promise<void> {
  const cleanKey = apiKey.trim();
  if (!cleanKey) {
    await removeSecureApiKey();
    return;
  }

  if (!isBrowserSupported()) {
    return;
  }

  const cryptoKey = await getOrCreateCryptoKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encodedPlaintext = new TextEncoder().encode(cleanKey);

  const ciphertextBuffer = await crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv,
    },
    cryptoKey,
    encodedPlaintext
  );

  const encryptedBase64 = uint8ToBase64(new Uint8Array(ciphertextBuffer));
  const ivBase64 = uint8ToBase64(iv);

  localStorage.setItem(ENCRYPTED_KEY_STORAGE, encryptedBase64);
  localStorage.setItem(IV_STORAGE, ivBase64);

  // Xóa sạch mọi key dạng rõ cũ nếu có
  for (const legacyKey of LEGACY_KEYS) {
    localStorage.removeItem(legacyKey);
  }
}

export async function migrateLegacyApiKeyIfNeeded(): Promise<void> {
  if (!isBrowserSupported()) {
    return;
  }

  for (const legacyKeyName of LEGACY_KEYS) {
    const legacyValue = localStorage.getItem(legacyKeyName);
    if (legacyValue && legacyValue.trim() !== '') {
      await saveSecureApiKey(legacyValue.trim());
      localStorage.removeItem(legacyKeyName);
      return;
    } else if (legacyValue !== null) {
      localStorage.removeItem(legacyKeyName);
    }
  }
}

export async function getSecureApiKey(): Promise<string> {
  if (!isBrowserSupported()) {
    return '';
  }

  await migrateLegacyApiKeyIfNeeded();

  const encryptedBase64 = localStorage.getItem(ENCRYPTED_KEY_STORAGE);
  const ivBase64 = localStorage.getItem(IV_STORAGE);

  if (!encryptedBase64 || !ivBase64) {
    return '';
  }

  try {
    const cryptoKey = await getStoredCryptoKey();
    if (!cryptoKey) {
      await removeSecureApiKey();
      return '';
    }

    const ciphertextBytes = base64ToUint8(encryptedBase64);
    const ivBytes = base64ToUint8(ivBase64);

    const decryptedBuffer = await crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: ivBytes as BufferSource,
      },
      cryptoKey,
      ciphertextBytes as BufferSource
    );

    const decoded = new TextDecoder().decode(decryptedBuffer).trim();
    return decoded;
  } catch (err) {
    console.warn('Phát hiện dữ liệu khóa bị can thiệp hoặc không hợp lệ. Tự động hủy khóa bảo mật.', err);
    await removeSecureApiKey();
    return '';
  }
}

export async function hasSecureApiKey(): Promise<boolean> {
  const key = await getSecureApiKey();
  return key.length > 0;
}
