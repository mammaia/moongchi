/**
 * 사진 보관함. 게임 안에서 찍은 사진을 기기에 저장한다.
 *
 * 왜 따로 두나: 사진은 크기가 커서 진행 상황 저장(localStorage, GameStore)에 넣으면
 * 용량이 금방 차고 자동 저장도 느려진다. 그래서 큰 파일용 브라우저 저장소(IndexedDB)에
 * 따로 넣는다. 진행 상황 저장과는 서로 건드리지 않는다.
 *
 * 주인: 사진 기능(src/features/photo). 다른 기능(예: 이후 다이어리)은 읽기만 한다.
 * 다이어리는 사진 id만 자기 저장 서랍에 적어 두고, 그릴 때 get(id)로 꺼내 쓰면 된다.
 * 사진이 지워지면 'photo:deleted' 알림이 오므로 붙여 둔 자리를 정리하면 된다.
 */

/** 사진 기록 형식 버전. 형식이 바뀌면 올리고 읽을 때 변환한다. */
export const PHOTO_RECORD_VERSION = 1;

/** 게임 오브젝트에 이 표시(setData)가 있으면 사진을 찍는 순간 숨긴다. (이름표, 보상 반짝이 등 UI) */
export const PHOTO_HIDDEN_KEY = 'photoHidden';

/** 찍을 때의 상황. 이후 다이어리·기억 기능이 쓸 수 있도록 함께 적어 둔다. */
export interface PhotoMeta {
  /** 찍는 순간 뭉치가 하던 행동 */
  activity?: string;
}

/** 앨범 목록에 필요한 정보 (큰 사진은 빼고 작은 사진만) */
export interface PhotoSummary {
  v: number;
  id: string;
  /** 찍은 시각 (게임 시계 기준, 밀리초) */
  takenAt: number;
  /** 찍은 날 (예: 2026-11-20) */
  dayKey: string;
  width: number;
  height: number;
  thumb: Blob;
  meta: PhotoMeta;
}

export interface PhotoRecord extends PhotoSummary {
  image: Blob;
}

export interface PhotoLibrary {
  /** 기기에 오래 남는 저장소인지. false면 앱을 닫으면 사진이 사라진다 (시크릿 모드 등). */
  isPersistent(): Promise<boolean>;
  add(photo: PhotoRecord): Promise<void>;
  /** 최신 사진부터 */
  list(): Promise<PhotoSummary[]>;
  get(id: string): Promise<PhotoRecord | null>;
  remove(id: string): Promise<void>;
}

const sortNewestFirst = <T extends { takenAt: number }>(items: T[]) => items.sort((a, b) => b.takenAt - a.takenAt);
const summaryOf = ({ image: _image, ...rest }: PhotoRecord): PhotoSummary => rest;

/** 메모리에만 두는 보관함. 테스트용이고, 기기 저장소를 못 쓸 때의 대비책. */
export function createMemoryPhotoLibrary(): PhotoLibrary {
  const items = new Map<string, PhotoRecord>();
  return {
    isPersistent: async () => false,
    add: async (photo) => void items.set(photo.id, photo),
    list: async () => sortNewestFirst([...items.values()].map(summaryOf)),
    get: async (id) => items.get(id) ?? null,
    remove: async (id) => void items.delete(id),
  };
}

const DB_NAME = 'moongchi-photos';
const DB_VERSION = 1;
/** 목록용 정보 + 작은 사진 */
const META = 'photos';
/** 큰 사진 (열어 볼 때만 읽는다) */
const IMAGES = 'images';

const done = (tx: IDBTransaction) =>
  new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new Error('사진 저장이 취소되었어요'));
  });
const result = <T>(req: IDBRequest<T>) =>
  new Promise<T>((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') return reject(new Error('IndexedDB 없음'));
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(META)) db.createObjectStore(META, { keyPath: 'id' });
      if (!db.objectStoreNames.contains(IMAGES)) db.createObjectStore(IMAGES);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error('IndexedDB 열기가 막혔어요'));
  });
}

/**
 * 브라우저 IndexedDB 보관함. 열 수 없으면(시크릿 모드 등) 메모리 보관함으로 대신한다.
 * 만들자마자 쓸 수 있고, 실제 열기는 첫 사용 때 기다린다.
 */
export function createBrowserPhotoLibrary(): PhotoLibrary {
  const fallback = createMemoryPhotoLibrary();
  const ready: Promise<IDBDatabase | null> = openDb().catch((error) => {
    console.warn('[photo] 기기 사진 저장소를 열 수 없어 임시 보관함을 씁니다.', error);
    return null;
  });

  return {
    async isPersistent() {
      return (await ready) !== null;
    },
    async add(photo) {
      const db = await ready;
      if (!db) return fallback.add(photo);
      const tx = db.transaction([META, IMAGES], 'readwrite');
      tx.objectStore(META).put(summaryOf(photo));
      tx.objectStore(IMAGES).put(photo.image, photo.id);
      await done(tx);
      // 기기가 저장 공간이 부족할 때 사진을 먼저 지우지 않도록 부탁한다. (안 되어도 괜찮다)
      void navigator.storage?.persist?.().catch(() => undefined);
    },
    async list() {
      const db = await ready;
      if (!db) return fallback.list();
      const tx = db.transaction(META, 'readonly');
      const rows = await result(tx.objectStore(META).getAll() as IDBRequest<PhotoSummary[]>);
      return sortNewestFirst(rows.filter((r) => r && typeof r.id === 'string'));
    },
    async get(id) {
      const db = await ready;
      if (!db) return fallback.get(id);
      const tx = db.transaction([META, IMAGES], 'readonly');
      const [meta, image] = await Promise.all([
        result(tx.objectStore(META).get(id) as IDBRequest<PhotoSummary | undefined>),
        result(tx.objectStore(IMAGES).get(id) as IDBRequest<Blob | undefined>),
      ]);
      return meta && image ? { ...meta, image } : null;
    },
    async remove(id) {
      const db = await ready;
      if (!db) return fallback.remove(id);
      const tx = db.transaction([META, IMAGES], 'readwrite');
      tx.objectStore(META).delete(id);
      tx.objectStore(IMAGES).delete(id);
      await done(tx);
    },
  };
}
