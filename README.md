# 日本語 단어장 (개인용)

Notion에 정리해둔 일본어 단어를 붙여넣으면 Claude API가 읽는법·뜻·예문을 자동으로 채워서
단어장으로 정리해주고, Anki 스타일 간격 반복(SRS)으로 복습할 수 있는 개인용 웹 앱입니다.

- 프론트엔드: React + Vite (로그인 없이 혼자 쓰는 용도)
- 데이터 저장: Firebase Firestore
- 단어 자동 생성: Claude API (Vercel Serverless Function을 통해 서버에서만 호출)
- 배포: GitHub + Vercel

---

## 1. Firebase 콘솔에서 해야 할 일

이미 Firebase 프로젝트(`study-65680`)를 만들어 설정 값을 주셨고, 코드(`src/firebase.js`)에 반영해두었습니다.
로그인 기능은 빼기로 해서, **Firestore Database만 만들면** 됩니다.

1. 왼쪽 메뉴 **Firestore Database** → **데이터베이스 만들기**
2. 위치(리전)는 **asia-northeast3 (서울)** 추천
3. 보안 규칙은 일단 "테스트 모드"로 시작해도 되지만, **아래 규칙으로 반드시 교체**하세요.
   (프로젝트에 포함된 `firestore.rules` 파일 내용과 동일합니다)

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/ckm-personal/{document=**} {
      allow read, write: if true;
    }
    match /{document=**} {
      allow read, write: if false;
    }
  }
}
```

콘솔의 **Firestore Database → 규칙(Rules)** 탭에 위 내용을 붙여넣고 **게시(Publish)** 하면 됩니다.

> ⚠️ **보안 참고**: 로그인이 없으므로 이 규칙은 `users/ckm-personal` 경로에 한해서는 URL만 알면 누구나
> 읽고 쓸 수 있게 열려 있습니다(그 외 경로는 전부 차단). 개인 취미용 단어장이라 데이터 민감도는 낮지만,
> 배포된 Vercel URL을 다른 사람과 공유하지 않는 것으로 충분히 안전합니다. 나중에 걱정되면 언제든
> 간단한 로그인을 다시 붙일 수 있습니다.

---

## 2. Claude API 키 발급

1. https://console.anthropic.com 에서 로그인 후 **API Keys** 메뉴에서 키 발급 (`sk-ant-...`)
2. 이 키는 절대 프론트엔드 코드나 GitHub에 커밋하지 마세요. **Vercel 환경변수로만 등록**합니다(3단계에서 진행).
3. 비용이 걱정되시면 `api/generate.js` 상단의 `MODEL` 값이 기본적으로
   저렴한 `claude-haiku-4-5-20251001` 모델로 설정되어 있습니다. 결과 품질을 더 높이고 싶다면
   Vercel 환경변수에 `CLAUDE_MODEL=claude-sonnet-5` 등으로 override 하면 됩니다.
   (모델 이름은 Anthropic이 주기적으로 구버전을 폐기하니, 나중에 또 `not_found_error`가 뜨면
   https://platform.claude.com/docs/en/about-claude/models/overview 에서 최신 모델 ID를 확인하세요.)
4. 메모에 새로 추가한 단어만 골라서 "단어장 업데이트"를 누른 만큼만 Claude API를 호출합니다
   (이미 처리했던 줄은 다시 보내지 않음 — 자세한 내용은 아래 "기능 요약" 참고).
   그래도 "응답을 JSON으로 해석하지 못했습니다" 오류가 뜨면 일시적인 응답 오류일 수 있으니
   한 번 더 시도해보시고, 계속되면 새로 추가한 줄을 조금씩 나눠서 업데이트해주세요.
5. **읽는법 정확도를 위해 웹 검색을 함께 사용합니다.** Claude가 한자 읽는법에 확신이 없으면
   Anthropic의 서버사이드 웹 검색 도구로 사전을 찾아본 뒤 답합니다(검색은 필요할 때만 자동으로 켜짐).
   추가 설정은 필요 없고, 검색 1,000회당 약 $10의 추가 비용이 붙지만(단어 하나에 보통 0~2회 정도),
   개인 단어장 규모에서는 무시할 만한 수준입니다. 그래도 여전히 확신이 안 서는 항목은 저장하지 않고
   단어장/복습 화면에 **"⚠️ 확인 필요"** 배지로 표시해줍니다 — 정확도가 100%가 되는 건 아니지만,
   어떤 단어를 직접 확인해봐야 하는지 눈에 띄게 해줍니다.

---

## 3. GitHub 업로드 + Vercel 배포

이전에 하셨던 방식과 동일합니다.

1. GitHub에서 새 저장소 생성 (예: `jp-vocab-app`), Private 권장
2. 이 zip 파일 압축을 풀어서 저장소에 웹 업로드(드래그 앤 드롭)
   - `node_modules` 폴더는 없으니 그대로 전체 파일/폴더를 올리면 됩니다.
3. https://vercel.com 에서 **Add New → Project** → 방금 만든 GitHub 저장소 선택 → Import
   - Framework Preset: **Vite**로 자동 인식됩니다.
4. **배포 전에 반드시** Vercel 프로젝트의 **Settings → Environment Variables** 에서 아래 추가:
   - `ANTHROPIC_API_KEY` = 2단계에서 발급받은 키
   - (선택) `CLAUDE_MODEL` = 다른 모델을 쓰고 싶을 때만
5. **Deploy** 클릭 → 완료 후 나오는 URL(`https://jp-vocab-app-xxxx.vercel.app`)로 접속하면 로그인 없이 바로 사용 가능

이후 코드를 수정하고 싶으면 GitHub 저장소 파일을 웹에서 수정(또는 다시 업로드)하면
Vercel이 자동으로 재배포합니다.

### 아이폰 홈 화면에 추가하기
Safari로 배포된 URL에 접속 → 공유 버튼 → "홈 화면에 추가"를 누르면 앱처럼 아이콘이 생깁니다.

---

## 4. 로컬에서 미리 확인하고 싶다면 (선택)

로컬 PC에 Node.js가 설치되어 있다면:

```bash
npm install
cp .env.example .env.local   # ANTHROPIC_API_KEY 값 채우기
npm run dev
```

단, `/api/generate` 서버리스 함수는 `vercel dev`로 실행해야 로컬에서도 동작합니다
(`npm i -g vercel` 후 `vercel dev`). 그냥 `npm run dev`로는 프론트엔드 화면만 보이고
"단어장 업데이트" 버튼은 배포 후에 정상 작동합니다.

---

## 5. 기능 요약

- **단어 입력**: 단어 하나 또는 Notion에서 복사한 텍스트 뭉치를 붙여넣고 "단어장 업데이트" 클릭
  → Claude가 단어/읽는법/뜻/예문/예문 읽는법/예문 뜻을 채워서 미리보기로 보여줌
  → 이미 있는 단어는 자동으로 "기존 단어 업데이트"로 표시됨 (덮어쓸지 개별 선택 가능)
  → **새로 추가한 줄만 분석**: 메모 전체를 매번 다시 스캔하지 않고, 지난번 업데이트 이후
  새로 적었거나 수정한 줄만 골라 Claude에 보냅니다. API 호출 횟수와 대기 시간이 크게 줄어듭니다.
  → **팁: 읽는법이나 들은 상황을 같이 적어두면 더 정확해집니다.** 예를 들어
  `諦める（あきらめる）- 드라마에서 들음` 처럼 한 줄에 단어 + 읽는법(또는 뜻) + 어디서/어떤 상황에서 접했는지를
  같이 적어두면, Claude가 그 정보를 최우선으로 존중해서 사용하고(직접 적은 읽는법은 검색으로 뒤집지 않음),
  상황 정보는 문맥에 맞는 뜻과 자연스러운 예문을 고르는 데 참고합니다. 아무 정보 없이 단어만 적어도 물론 동작합니다.
- **단어장**: 등록된 모든 단어 목록, 검색, 발음 듣기(브라우저 TTS), 삭제
- **복습**: Anki 스타일 SRS(간격 반복) — 카드를 탭해서 뒤집고 "다시/어려움/보통/쉬움"으로 평가하면
  다음 복습 시점이 자동 계산됨. 연속 학습일(스트릭), 오늘 복습 개수 표시.
  자주 틀리는 단어는 "헷갈리는 단어" 섹션에 따로 모아서 보여줌.
- **✏️ 직접 수정 / 🪄 AI로 단어 수정**: 단어장 카드나 복습 카드 뒷면에서 뜻/읽는법이 틀린 걸 발견하면 두 가지 방법으로 고칠 수 있습니다.
  - ✏️ 직접 수정: 모든 필드를 바로 편집해서 "저장" — API 호출 없이 즉시 반영됩니다.
  - 🪄 AI로 수정: 메모(예: "읽는법이 틀렸어요", "이런 뜻도 있어요")를 적고 "AI에게 확인 요청"을 누르면
    Claude가 웹 검색까지 활용해서 그 단어 항목만 다시 다듬어서 무엇이 바뀌는지 보여주고, 확인 후
    "이대로 적용"을 눌러야만 저장됩니다 (`api/refine.js`, 같은 `ANTHROPIC_API_KEY`를 사용하므로 추가 설정 필요 없음).
  - 직접 수정으로 저장하면 "확인 필요" 표시가 자동으로 사라집니다(사용자가 직접 확인한 것으로 간주).
- **⚠️ 확인 필요 배지**: Claude가 읽는법 등에 확신이 없는 항목은 웹 검색으로 한 번 더 확인한 뒤에도
  여전히 불확실하면 저장하지 않고 넘어가는 대신, 왜 불확실한지 짧은 메모와 함께 단어장 카드/복습 카드에
  표시해줍니다. 완벽하게 정확도를 보장하진 않지만, 어떤 단어를 우선적으로 검증해야 하는지 알려줍니다.
- 반응형 레이아웃으로 폰/태블릿/PC 화면 모두 대응.

## 6. 참고 문서 (출처)

- Firebase Firestore 보안 규칙: https://firebase.google.com/docs/firestore/security/get-started
- Anthropic Messages API: https://docs.claude.com/en/api/messages
- Anthropic 웹 검색 도구(서버사이드): https://platform.claude.com/docs/en/agents-and-tools/tool-use/web-search-tool
- Vite 공식 문서: https://vitejs.dev
