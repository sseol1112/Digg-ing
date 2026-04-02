const ITUNES_SEARCH_URL = "https://itunes.apple.com/search";
const ITUNES_LOOKUP_URL = "https://itunes.apple.com/lookup";

function normalize(text) {
  return String(text || "").toLowerCase().trim();
}

function tokenize(text) {
  return normalize(text).split(/[\s,./_()-]+/).filter(Boolean);
}

function titleSimilarity(query, candidateTitle) {
  const qTerms = new Set(tokenize(query));
  if (!qTerms.size) return 0;
  const cTerms = new Set(tokenize(candidateTitle));
  let matches = 0;
  qTerms.forEach((term) => {
    if (cTerms.has(term)) matches += 1;
  });
  return matches / qTerms.size;
}

function mapTrack(item, reason = "기준곡과 유사한 후보") {
  return {
    id: `itunes-${item.trackId || `${item.artistName}-${item.trackName}`}`.replace(/\s+/g, "-"),
    title: item.trackName || "Unknown",
    artist: item.artistName || "Unknown",
    genre: item.primaryGenreName || "iTunes",
    tags: ["itunes", "music", normalize(item.collectionName || "")].filter(Boolean),
    imageUrl: item.artworkUrl100 || "",
    externalUrl: item.trackViewUrl || "",
    previewUrl: item.previewUrl || "",
    source: "iTunes",
    popularity: typeof item.trackPrice === "number" ? 55 : 45,
    reason
  };
}

async function iTunesSearch(params) {
  const query = {
    country: "KR",
    media: "music",
    ...params
  };
  const json = await requestJsonp(ITUNES_SEARCH_URL, query);
  return json?.results || [];
}

async function iTunesLookup(params) {
  const query = {
    country: "KR",
    ...params
  };
  const json = await requestJsonp(ITUNES_LOOKUP_URL, query);
  return json?.results || [];
}

export async function findItunesSimilarTracks(query, limit = 18) {
  const seedCandidates = await iTunesSearch({
    term: query,
    entity: "song",
    limit: "12"
  });
  if (!seedCandidates.length) return [];

  const seed = [...seedCandidates].sort(
    (a, b) => titleSimilarity(query, b.trackName) - titleSimilarity(query, a.trackName)
  )[0];

  const exactKey = normalize(`${seed.artistName}-${seed.trackName}`);
  const bucket = new Map();

  const artistTracksPromise = seed.artistId
    ? iTunesLookup({
        id: String(seed.artistId),
        entity: "song",
        limit: "40"
      })
    : Promise.resolve([]);

  const genreTracksPromise = seed.primaryGenreName
    ? iTunesSearch({
        term: `${seed.primaryGenreName} ${seed.artistName}`,
        entity: "song",
        limit: "30"
      })
    : Promise.resolve([]);

  const relatedSearchPromise = iTunesSearch({
    term: `${seed.artistName} similar`,
    entity: "song",
    limit: "30"
  });

  const [artistTracksRaw, genreTracksRaw, relatedTracksRaw] = await Promise.all([
    artistTracksPromise,
    genreTracksPromise,
    relatedSearchPromise
  ]);

  const normalizedSeedCandidates = seedCandidates.map((item) =>
    mapTrack(item, "입력 곡과 가까운 기준 후보")
  );
  const artistTracks = artistTracksRaw
    .filter((item) => item.wrapperType === "track")
    .map((item) => mapTrack(item, "같은 아티스트 기반 유사곡"));
  const genreTracks = genreTracksRaw.map((item) => mapTrack(item, "비슷한 장르/분위기"));
  const relatedTracks = relatedTracksRaw.map((item) => mapTrack(item, "연관 검색 기반 유사곡"));

  [...artistTracks, ...genreTracks, ...relatedTracks, ...normalizedSeedCandidates].forEach((track) => {
    const key = normalize(`${track.artist}-${track.title}`);
    if (key === exactKey) return;
    if (!bucket.has(key)) bucket.set(key, track);
  });

  return [...bucket.values()].slice(0, limit);
}

function requestJsonp(url, params, timeoutMs = 12000) {
  return new Promise((resolve, reject) => {
    const callbackName = `itunesJsonp_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
    const script = document.createElement("script");
    const timer = window.setTimeout(() => {
      cleanup();
      reject(new Error("iTunes 요청 시간이 초과되었습니다."));
    }, timeoutMs);

    const cleanup = () => {
      window.clearTimeout(timer);
      if (script.parentNode) {
        script.parentNode.removeChild(script);
      }
      try {
        delete window[callbackName];
      } catch {
        window[callbackName] = undefined;
      }
    };

    window[callbackName] = (payload) => {
      cleanup();
      resolve(payload);
    };

    script.onerror = () => {
      cleanup();
      reject(new Error("iTunes JSONP 요청에 실패했습니다."));
    };

    const search = new URLSearchParams({
      ...params,
      callback: callbackName
    });
    script.src = `${url}?${search.toString()}`;
    document.body.appendChild(script);
  });
}
