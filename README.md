# gitblog-membership

GitBlog 멤버십 글을 **사용자 블로그 안에서 읽는 독립 Cloudflare Worker**입니다. 저장소와 배포는 GitBlog 앱과 분리되며, 기존 임베드 주소는 유지합니다.

```text
블로그 템플릿 iframe
  → https://gitblog.app/membership/embed/{articleId}?origin={blogOrigin}&lang=ko&theme=dark
  → GitBlog: 게시 상태와 등록된 블로그 origin 확인
  → MEMBERSHIP Service Binding → gitblog-membership: 독립 HTML/JS/CSS

iframe → GitBlog 로그인 팝업 → 일회용 코드 → 글 한정 임시 토큰
iframe → GitBlog /api/membership/read/{id} 및 /api/membership/assets/{id}
       → 매 요청 회원 권한 확인 → 비공개 본문 / 이미지
```

## 역할

| 저장소 | 담당 |
| --- | --- |
| gitblog-membership | 읽기 화면, 가입 안내, 12개 언어, 테마, 로그인 팝업 연동, iframe 높이 |
| gitblog | 계정·멤버십·결제 정책, 전문/이미지 저장, 권한 확인, 토큰 발급, 공개 진입점 |
| 블로그 템플릿 | 공개 미리보기, iframe 배치, 언어·테마 전달, 높이 조절 |

이 Worker에는 DB/R2 바인딩이나 인증 비밀키가 없습니다. `workers.dev`, preview URL, 공개 라우트도 사용하지 않습니다. GitBlog는 본문·쿠키·토큰 없이 공개 메타데이터만 서비스로 전달합니다. 전문은 서버에서 정화된 HTML로 권한 검사 후 제공되고, 글 한정 토큰은 iframe 메모리에만 존재합니다. 상위 블로그에는 본문이나 토큰을 보내지 않습니다.

## 개발과 배포

Node 22 이상:

```sh
npm ci
npm run check
npm test
npm run build
npm run deploy
```

`npm run generate`는 브라우저 코드를 esbuild로 묶어 nonce가 적용되는 독립 HTML 자산을 만듭니다. 생성 파일은 Git에 넣지 않습니다. 앱의 Svelte 번들에 의존하지 않으므로 앱 배포와 독립적으로 업데이트할 수 있습니다.

GitBlog `wrangler.jsonc`에 다음 바인딩이 필요합니다:

```json
{ "binding": "MEMBERSHIP", "service": "gitblog-membership" }
```

처음에는 이 Worker를 먼저 배포하고 GitBlog를 배포합니다. 이후 읽기 화면 변경은 이 저장소에서만 배포하면 됩니다. GitHub Actions는 타입·보안 회귀 테스트·빌드를 검증하며, 배포는 인증된 Wrangler로 실행합니다. 배포용 장기 토큰은 저장소에 추가하지 않았습니다.

로컬에서는 `npm run dev`를 켜고 GitBlog의 `preview:worker`를 함께 실행하여 서비스 바인딩을 연결합니다. GitBlog 로컬 DB에 공개 테스트 글과 등록된 HTTPS 블로그 origin이 있어야 합니다. 실제 iframe 검증은 그 블로그에서 수행합니다.

## v1 계약

- 내부 `POST /internal/render`: `{version:1,id,blogId,title,parentOrigin,locale,theme}`. 이 주소를 외부에 노출하지 않습니다.
- `theme`: `auto | light | dark`. `locale`: ar/de/en/es/fr/it/ja/ko/pt/pt-br/zh-hans/zh-hant.
- 공개 URL은 GitBlog가 소유하며 `origin`은 등록된 블로그 origin과 정확히 일치해야 합니다.
- iframe → 부모: `{type:'gitblog-membership-resize',id,height}`. 반드시 GitBlog origin, iframe의 `contentWindow`, 글 ID를 모두 확인합니다.
- 부모 → iframe: `{type:'gitblog-membership-theme',id,theme}`. 등록된 부모 origin과 `window.parent`를 확인합니다. 테마 변경 시 iframe을 새로 만들지 않습니다.
- 위 메시지는 선택적 `appearance`도 받습니다: `text`, `bodyText`, `muted`, `border`, `surface`, `background`, `accent` 색상; `bodyFont`, `headingFont` 글꼴 계열; `fontSize`(12–40px), `lineHeight`(1.2–2.5). 템플릿이 현재 본문의 계산된 스타일을 전달하며 서비스는 허용된 값만 적용합니다. CSS 코드, URL, 스타일시트는 받지 않습니다. 웹폰트 파일은 프레임 사이에 공유되지 않으므로 별도 로드되지 않은 글꼴은 지정된 시스템 대체 글꼴로 표시합니다.
- 팝업 → iframe: `{type:'gitblog-membership-grant',code,challenge}`. GitBlog origin, 열린 팝업, 일회용 challenge를 모두 확인합니다.
- lang/theme 없는 기존 v1 템플릿도 계속 동작합니다. 다른 프레임워크도 같은 iframe 프로토콜을 사용하면 됩니다.

## 운영 및 복구

응답의 `X-GitBlog-Membership-Version`과 `X-GitBlog-Membership-Transport: service-binding`으로 분리 서비스 연결을 확인합니다. HTML은 항상 `private, no-store`, `noindex, nofollow`이며 CSP는 등록된 블로그에만 프레이밍을 허용합니다. 서비스 장애 시 GitBlog는 503을 반환하며 공개 본문으로 우회하지 않습니다.

Worker 업데이트 문제는 `npx wrangler rollback <version-id>`로 복구합니다. 최초 분리 자체를 되돌릴 때는 GitBlog를 이전 버전으로 먼저 복구합니다. 이 서비스 배포/복구는 멤버십 데이터·결제 상태를 변경하지 않습니다.

현재 가입은 결제 없는 임시 가입입니다. 실제 결제 연동은 GitBlog의 권한·결제 계층에 추가하며 이 서비스에서 처리하지 않습니다.

Reference: [Cloudflare HTTP Service Bindings](https://developers.cloudflare.com/workers/runtime-apis/bindings/service-bindings/http/).
