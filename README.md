# Digg-ing
음악 디깅 앱

좋아하는 음악과 비슷한 곡/아티스트를 찾는 React + SCSS 기반 디깅 앱입니다.

## 실행

```bash
npm install
npm run dev
```

## GitHub Pages 배포

- 이 저장소는 `master` 브랜치 push 시 GitHub Actions로 Pages 배포됩니다.
- 배포 URL: `https://sseol1112.github.io/Digg-ing/`
- 저장소명을 변경하면 `vite.config.js`의 `base` 값도 함께 수정해야 합니다.

## API 연동 설정

- 현재 버전은 iTunes 기반 추천만 사용하며, 별도 API 키가 필요하지 않습니다.

## 구현된 기능

1. 회원가입/로그인 (로컬 스토리지 세션 유지)
2. 텍스트/이미지 기반 유사 음악 추천
3. iTunes 후보 수집 + 유사도/취향 기반 추천 정렬
4. 음성 인식(Web Speech API) 기반 곡 탐색
5. 사용자별 즐겨찾기 저장
6. 트랙 공유(Web Share API, 링크 복사, 카카오 공유 링크)
7. 간단 커뮤니티 게시판(작성/조회/삭제)

## GitHub Pages 배포

- 이 저장소는 `main` 브랜치 push 시 GitHub Actions로 Pages 배포됩니다.
- 배포 URL: `https://sseol1112.github.io/Digg-ing/`
- 저장소명을 변경하면 `vite.config.js`의 `base` 값도 함께 수정해야 합니다.

## 참고

- iTunes는 키 없이 바로 동작합니다.
- 실제 운영에서는 API 키 보호를 위해 백엔드 프록시를 두는 것을 권장합니다.

## 기술 스택

- React 18
- Vite 5
- SCSS
