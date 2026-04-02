import { useEffect, useMemo, useRef, useState } from "react";
import { TRACKS } from "./data/catalog";
import {
  clearSession,
  getSessionUserId,
  readPosts,
  readUsers,
  setSessionUserId,
  writePosts,
  writeUsers
} from "./utils/storage";
import { findItunesSimilarTracks } from "./services/itunes";

function normalize(text) {
  return (text || "").toLowerCase().trim();
}

function tokenize(text) {
  return normalize(text)
    .split(/[\s,./_()-]+/)
    .filter(Boolean);
}

function makeTrackId(track) {
  return normalize(`${track.artist}-${track.title}`).replace(/[^a-z0-9-]+/g, "-");
}

function ensureTrackShape(track) {
  return {
    ...track,
    id: track.id || `local-${makeTrackId(track)}`,
    imageUrl: track.imageUrl || "",
    externalUrl: track.externalUrl || "",
    reason: track.reason || "",
    score: typeof track.score === "number" ? track.score : null,
    popularity: typeof track.popularity === "number" ? track.popularity : 50,
    source: track.source || "Local"
  };
}

function scoreTrackHeuristic(track, input, favorites) {
  const terms = tokenize(input);
  const sourceText = normalize(
    `${track.title} ${track.artist} ${track.genre} ${(track.tags || []).join(" ")}`
  );
  let score = 0;
  terms.forEach((term) => {
    if (sourceText.includes(term)) score += 12;
  });

  const favoriteArtists = new Set((favorites || []).map((item) => normalize(item.artist)));
  if (favoriteArtists.has(normalize(track.artist))) score += 20;

  const favoriteGenres = new Set((favorites || []).map((item) => normalize(item.genre)));
  if (favoriteGenres.has(normalize(track.genre))) score += 12;

  score += Math.floor((track.popularity || 50) * 0.35);
  if (track.source === "iTunes") score += 3;

  return Math.max(0, Math.min(score, 100));
}

function rerankFallback(candidates, input, favorites, limit = 12) {
  return [...candidates]
    .map((track) => {
      const score = scoreTrackHeuristic(track, input, favorites);
      return {
        ...track,
        score,
        reason: track.reason || "기준곡 유사도 + 즐겨찾기 취향을 기반으로 추천"
      };
    })
    .sort((a, b) => (b.score || 0) - (a.score || 0))
    .slice(0, limit);
}

function getLocalMatchesByKeyword(input) {
  const terms = tokenize(input);
  if (!terms.length) return TRACKS.slice(0, 6).map(ensureTrackShape);

  return TRACKS.map((track) => {
    const source = `${track.title} ${track.artist} ${track.genre} ${track.tags.join(" ")}`.toLowerCase();
    let score = 0;
    for (const term of terms) {
      if (source.includes(term)) score += 2;
      if (track.tags.some((tag) => tag.includes(term))) score += 1;
    }
    return { track: ensureTrackShape(track), score };
  })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 8)
    .map((entry) => entry.track);
}

function mergeAndDedupeTracks(...trackGroups) {
  const bucket = new Map();
  for (const group of trackGroups) {
    for (const rawTrack of group || []) {
      const track = ensureTrackShape(rawTrack);
      const key = makeTrackId(track);
      if (!bucket.has(key)) {
        bucket.set(key, track);
      }
    }
  }
  return [...bucket.values()];
}

function readFavoriteTracks(user) {
  const rawFavorites = user?.favorites || [];
  return rawFavorites
    .map((favorite) => {
      if (typeof favorite === "string") {
        const local = TRACKS.find((track) => track.id === favorite);
        return local ? ensureTrackShape(local) : null;
      }
      return ensureTrackShape(favorite);
    })
    .filter(Boolean);
}

function hasFavorite(user, track) {
  const key = makeTrackId(track);
  return readFavoriteTracks(user).some((favorite) => makeTrackId(favorite) === key);
}

function AuthScreen({ onLogin, onRegister }) {
  const [mode, setMode] = useState("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  const submit = (e) => {
    e.preventDefault();
    setError("");
    if (!email || !password || (mode === "register" && !name)) {
      setError("모든 필드를 입력해주세요.");
      return;
    }

    if (mode === "login") {
      const result = onLogin(email, password);
      if (!result.ok) setError(result.message);
      return;
    }

    const result = onRegister(name, email, password);
    if (!result.ok) {
      setError(result.message);
    } else {
      setMode("login");
      setName("");
      setPassword("");
    }
  };

  return (
    <div className="auth-wrap">
      <div className="auth-card">
        <h1>Digg-ing</h1>
        <p>좋아하는 음악에서 새로운 취향을 발견하세요.</p>
        <form onSubmit={submit}>
          {mode === "register" && (
            <label>
              이름
              <input value={name} onChange={(e) => setName(e.target.value)} />
            </label>
          )}
          <label>
            이메일
            <input value={email} onChange={(e) => setEmail(e.target.value)} />
          </label>
          <label>
            비밀번호
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          {error && <p className="error">{error}</p>}
          <button type="submit">
            {mode === "login" ? "로그인" : "회원가입"}
          </button>
        </form>
        <button
          className="link-btn"
          onClick={() => setMode(mode === "login" ? "register" : "login")}
        >
          {mode === "login"
            ? "계정이 없나요? 회원가입"
            : "이미 계정이 있나요? 로그인"}
        </button>
      </div>
    </div>
  );
}

function TrackCard({ track, isFav, onToggleFav, onShare }) {
  return (
    <article className="track-card">
      {track.imageUrl ? (
        <img src={track.imageUrl} alt={track.title} className="track-cover-image" />
      ) : (
        <div className="track-cover">{track.title.slice(0, 2).toUpperCase()}</div>
      )}
      <div className="track-info">
        <h4>{track.title}</h4>
        <p>{track.artist}</p>
        <small>{track.genre}</small>
        <small className="source-chip">{track.source}</small>
        {track.score !== null && <small className="score-chip">추천점수 {track.score}</small>}
        {track.reason && <small className="reason-text">{track.reason}</small>}
      </div>
      <div className="track-actions">
        <button onClick={() => onToggleFav(track)}>{isFav ? "★" : "☆"}</button>
        <button onClick={() => onShare(track)}>공유</button>
        {track.externalUrl && (
          <a href={track.externalUrl} target="_blank" rel="noreferrer">
            열기
          </a>
        )}
      </div>
    </article>
  );
}

export default function App() {
  const [users, setUsers] = useState(() => readUsers());
  const [posts, setPosts] = useState(() => readPosts());
  const [sessionUserId, setLocalSessionUserId] = useState(() => getSessionUserId());
  const [query, setQuery] = useState("");
  const [results, setResults] = useState(() => TRACKS.slice(0, 6).map(ensureTrackShape));
  const [imageFile, setImageFile] = useState(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState("");
  const [voiceText, setVoiceText] = useState("");
  const [boardTitle, setBoardTitle] = useState("");
  const [boardBody, setBoardBody] = useState("");
  const [status, setStatus] = useState("");
  const [diggingLoading, setDiggingLoading] = useState(false);
  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const sidebarRef = useRef(null);

  const currentUser = useMemo(
    () => users.find((user) => user.id === sessionUserId) || null,
    [users, sessionUserId]
  );

  const favoriteTracks = useMemo(() => readFavoriteTracks(currentUser), [currentUser]);

  useEffect(() => {
    if (!imageFile) {
      setImagePreviewUrl("");
      return;
    }
    const objectUrl = URL.createObjectURL(imageFile);
    setImagePreviewUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [imageFile]);

  useEffect(() => {
    const onResize = () => {
      if (window.innerWidth > 1100) {
        setMobileMenuOpen(false);
      }
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const login = (email, password) => {
    const user = users.find(
      (entry) => normalize(entry.email) === normalize(email) && entry.password === password
    );
    if (!user) return { ok: false, message: "이메일 또는 비밀번호가 맞지 않습니다." };
    setLocalSessionUserId(user.id);
    setSessionUserId(user.id);
    return { ok: true };
  };

  const register = (name, email, password) => {
    if (users.some((entry) => normalize(entry.email) === normalize(email))) {
      return { ok: false, message: "이미 사용중인 이메일입니다." };
    }
    const newUser = {
      id: `usr-${Date.now()}`,
      name,
      email,
      password,
      favorites: []
    };
    const nextUsers = [...users, newUser];
    setUsers(nextUsers);
    writeUsers(nextUsers);
    return { ok: true };
  };

  const logout = () => {
    setLocalSessionUserId(null);
    clearSession();
    setShowLogoutModal(false);
    setMobileMenuOpen(false);
  };

  const moveToSection = (sectionId) => {
    setMobileMenuOpen(false);
    window.setTimeout(() => {
      const section = document.getElementById(sectionId);
      if (!section) return;
      const isMobile = window.innerWidth <= 1100;
      const sidebarHeight = isMobile ? sidebarRef.current?.offsetHeight || 0 : 0;
      const topGap = isMobile ? 12 : 16;
      const top = section.getBoundingClientRect().top + window.scrollY - (sidebarHeight + topGap);
      window.scrollTo({ top, behavior: "smooth" });
      window.history.replaceState(null, "", `#${sectionId}`);
    }, 140);
  };

  const toggleFavorite = (track) => {
    if (!currentUser) return;
    const target = ensureTrackShape(track);
    const nextUsers = users.map((user) => {
      if (user.id !== currentUser.id) return user;
      const favorites = readFavoriteTracks(user);
      const exists = favorites.some((favorite) => makeTrackId(favorite) === makeTrackId(target));
      return {
        ...user,
        favorites: exists
          ? favorites.filter((favorite) => makeTrackId(favorite) !== makeTrackId(target))
          : [...favorites, target]
      };
    });
    setUsers(nextUsers);
    writeUsers(nextUsers);
  };

  const runDiggingByText = async (input) => {
    const localMatches = getLocalMatchesByKeyword(input);
    const apiJobs = [findItunesSimilarTracks(input, 18)];

    const settled = await Promise.allSettled(apiJobs);
    const remoteMatches = settled
      .filter((entry) => entry.status === "fulfilled")
      .flatMap((entry) => entry.value);

    const merged = remoteMatches.length
      ? mergeAndDedupeTracks(remoteMatches)
      : mergeAndDedupeTracks(remoteMatches, localMatches);
    const favorites = readFavoriteTracks(currentUser);
    const ranked = rerankFallback(merged, input, favorites, 12);

    setResults(ranked.length ? ranked : TRACKS.slice(0, 6).map(ensureTrackShape));

    const availableApis = ["iTunes"];
    const apiText = availableApis.length ? ` (${availableApis.join(", ")} 반영)` : "";
    setStatus(
      ranked.length
        ? `기준곡과 유사한 음악을 찾았어요.${apiText}`
        : "유사곡을 찾지 못해 기본 추천을 보여줍니다."
    );
  };

  const runDigging = async () => {
    try {
      setDiggingLoading(true);
      const imageHint = imageFile ? imageFile.name.replace(/\.[a-zA-Z0-9]+$/, "") : "";
      const joined = `${query} ${imageHint}`.trim();
      if (!joined) {
        setStatus("검색어 또는 이미지를 입력해주세요.");
        return;
      }
      await runDiggingByText(joined);
    } catch (error) {
      setStatus(error.message || "추천 처리 중 오류가 발생했습니다.");
    } finally {
      setDiggingLoading(false);
    }
  };

  const runVoiceRecognition = () => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setStatus("이 브라우저는 음성 인식을 지원하지 않습니다.");
      return;
    }
    const recognition = new SpeechRecognition();
    recognition.lang = "ko-KR";
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    recognition.onresult = async (event) => {
      const spoken = event.results[0][0].transcript;
      setVoiceText(spoken);
      setDiggingLoading(true);
      try {
        await runDiggingByText(spoken);
        setStatus(`음성 인식 완료: "${spoken}"`);
      } catch (error) {
        setStatus(error.message || "음성 추천 처리 중 오류가 발생했습니다.");
      } finally {
        setDiggingLoading(false);
      }
    };
    recognition.onerror = () => setStatus("음성 인식 중 오류가 발생했습니다.");
    recognition.start();
  };

  const shareTrack = async (track) => {
    const text = `${track.artist} - ${track.title} 취향 공유`;
    const shareUrl = track.externalUrl || `${window.location.origin}?track=${track.id}`;
    if (navigator.share) {
      await navigator.share({ title: "Digg-ing", text, url: shareUrl });
      return;
    }
    await navigator.clipboard.writeText(`${text}\n${shareUrl}`);
    setStatus("공유 링크를 클립보드에 복사했습니다.");
  };

  const shareKakao = async () => {
    const text = `내 음악 취향 공유: ${results
      .slice(0, 3)
      .map((track) => `${track.artist}-${track.title}`)
      .join(", ")}`;
    const url = `https://share.kakao.com/?text=${encodeURIComponent(text)}`;
    window.open(url, "_blank", "noopener,noreferrer");
  };

  const addPost = (e) => {
    e.preventDefault();
    if (!boardTitle || !boardBody || !currentUser) return;
    const post = {
      id: `post-${Date.now()}`,
      userId: currentUser.id,
      userName: currentUser.name,
      title: boardTitle,
      body: boardBody,
      createdAt: new Date().toISOString()
    };
    const nextPosts = [post, ...posts];
    setPosts(nextPosts);
    writePosts(nextPosts);
    setBoardTitle("");
    setBoardBody("");
  };

  const deletePost = (postId) => {
    const nextPosts = posts.filter((post) => post.id !== postId);
    setPosts(nextPosts);
    writePosts(nextPosts);
  };

  if (!currentUser) {
    return <AuthScreen onLogin={login} onRegister={register} />;
  }

  return (
    <div className="layout">
      <aside className="sidebar" ref={sidebarRef}>
        <div className="sidebar-top">
          <h2>Digg-ing</h2>
          <button
            className={`menu-toggle ${mobileMenuOpen ? "open" : ""}`}
            type="button"
            aria-label={mobileMenuOpen ? "메뉴 닫기" : "메뉴 열기"}
            aria-expanded={mobileMenuOpen}
            onClick={() => setMobileMenuOpen((prev) => !prev)}
          >
            <span />
            <span />
            <span />
          </button>
        </div>
        <p>{currentUser.name}님 환영합니다.</p>
        <nav className={mobileMenuOpen ? "mobile-open" : ""}>
          <button type="button" className="nav-link" onClick={() => moveToSection("discover")}>
            디깅
          </button>
          <button type="button" className="nav-link" onClick={() => moveToSection("voice")}>
            음성 인식
          </button>
          <button type="button" className="nav-link" onClick={() => moveToSection("favorites")}>
            즐겨찾기
          </button>
          <button type="button" className="nav-link" onClick={() => moveToSection("community")}>
            커뮤니티
          </button>
        </nav>
        <button className="logout-btn" onClick={() => setShowLogoutModal(true)}>
          로그아웃
        </button>
      </aside>
      {mobileMenuOpen && (
        <button
          type="button"
          aria-label="메뉴 닫기"
          className="mobile-nav-overlay"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      <main>
        <header className="topbar">
          <h1>좋아하는 음악에서 다음 취향을 찾기</h1>
          <div className="share-actions">
            <button onClick={() => navigator.clipboard.writeText(window.location.href)}>
              링크 복사
            </button>
            <button onClick={shareKakao}>카카오 공유</button>
          </div>
        </header>

        <section id="discover" className="panel">
          <h3>1) 텍스트/이미지 디깅</h3>
          <div className="api-row">
            <span>iTunes: 사용중(키 불필요)</span>
          </div>
          <div className="search-row">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="좋아하는 곡, 아티스트, 분위기 입력"
            />
            <input
              type="file"
              accept="image/*"
              onChange={(e) => setImageFile(e.target.files?.[0] || null)}
            />
            <button onClick={runDigging} disabled={diggingLoading}>
              {diggingLoading ? "분석 중..." : "유사 음악 찾기"}
            </button>
          </div>
          {imagePreviewUrl && (
            <div className="image-preview-card">
              <img src={imagePreviewUrl} alt="업로드 미리보기" className="image-preview-thumb" />
              <div>
                <p>업로드된 이미지</p>
                <small>{imageFile?.name}</small>
              </div>
            </div>
          )}
          <p className="hint">
            입력한 곡을 기준곡으로 잡고, 같은 아티스트/장르/연관 검색을 통해 유사곡을 추천합니다.
          </p>
        </section>

        <section id="voice" className="panel">
          <h3>2) 음성 인식</h3>
          <div className="voice-row">
            <button onClick={runVoiceRecognition} disabled={diggingLoading}>
              음성으로 검색 시작
            </button>
            <p>{voiceText ? `인식된 텍스트: ${voiceText}` : "가사/제목/아티스트를 말해보세요."}</p>
          </div>
        </section>

        <section className="panel">
          <h3>추천 결과</h3>
          <div className="track-grid">
            {results.map((track) => (
              <TrackCard
                key={track.id}
                track={track}
                isFav={hasFavorite(currentUser, track)}
                onToggleFav={toggleFavorite}
                onShare={shareTrack}
              />
            ))}
          </div>
        </section>

        <section id="favorites" className="panel">
          <h3>3) 즐겨찾기</h3>
          <div className="track-grid">
            {favoriteTracks.length ? (
              favoriteTracks.map((track) => (
                <TrackCard
                  key={`fav-${track.id}`}
                  track={track}
                  isFav
                  onToggleFav={toggleFavorite}
                  onShare={shareTrack}
                />
              ))
            ) : (
              <p>아직 즐겨찾기가 없습니다. 별 버튼으로 추가해보세요.</p>
            )}
          </div>
        </section>

        <section id="community" className="panel">
          <h3>4) 커뮤니티 게시판</h3>
          <form onSubmit={addPost} className="board-form">
            <input
              placeholder="제목"
              value={boardTitle}
              onChange={(e) => setBoardTitle(e.target.value)}
            />
            <textarea
              placeholder="좋아하는 음악/아티스트를 공유해보세요."
              value={boardBody}
              onChange={(e) => setBoardBody(e.target.value)}
            />
            <button type="submit">게시글 작성</button>
          </form>
          <div className="posts">
            {posts.map((post) => (
              <article key={post.id} className="post">
                <div>
                  <h4>{post.title}</h4>
                  <small>
                    {post.userName} · {new Date(post.createdAt).toLocaleString()}
                  </small>
                  <p>{post.body}</p>
                </div>
                {post.userId === currentUser.id && (
                  <button onClick={() => deletePost(post.id)}>삭제</button>
                )}
              </article>
            ))}
            {!posts.length && <p>첫 게시글을 작성해보세요.</p>}
          </div>
        </section>

        {status && <p className="status">{status}</p>}
      </main>
      {showLogoutModal && (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <div className="confirm-modal">
            <h3>로그아웃 하시겠어요?</h3>
            <p>현재 세션이 종료되고 로그인 화면으로 이동합니다.</p>
            <div className="confirm-actions">
              <button className="cancel-btn" onClick={() => setShowLogoutModal(false)}>
                취소
              </button>
              <button onClick={logout}>로그아웃</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
