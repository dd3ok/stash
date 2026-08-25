# Stash

[English](README.md) | 한국어

Stash는 가끔 쓰는 [`SKILL.md`](https://agentskills.io) 패키지를 호스트의
일반 검색 경로 밖에 둡니다. `$stash`를 명시적으로 호출하면 정확한 스킬을
열고, 작업 내용으로 로컬 보관함을 검색하거나, 독립 스킬의 비활성 사본을
관리할 수 있습니다.

```text
$stash design-system
→ 정확한 이름의 저장 스킬 불러오기

$stash API 문서 검토에 필요한 스킬을 모두 찾아줘
→ 실질적으로 관련된 저장 스킬 전체 반환
```

검색은 로컬·읽기 전용입니다. 검색만으로 다운로드·설치·업데이트·실행하지
않습니다.

## 언제 사용하나요?

매일 쓰는 스킬이 적고 역할이 뚜렷하면 호스트의 기본 스킬 폴더가 더
단순합니다. 많은 로컬 스킬의 이름과 설명을 일반 검색 메타데이터에 모두
노출하지 않고 필요할 때 찾고 싶다면 Stash를 사용합니다.

```text
호스트 기본 검색
├── 매일 쓰는 스킬
└── Stash
     └── 명시 요청 → 로컬 보관함 → 선택한 SKILL.md
```

정확한 이름은 결정적인 경로로 먼저 찾고, 작업 검색은 로컬 어휘 검색을
사용합니다. 페이지 크기가 전체 관련 결과를 자르지 않습니다.

## 빠른 시작

Node.js 20 이상이 필요합니다.

```bash
npm ci
npm run test:all
node skills/stash/scripts/stash.mjs help
```

포함된 예제 보관함을 확인합니다.

```bash
node skills/stash/scripts/stash.mjs doctor --config examples/config.yaml
node skills/stash/scripts/stash.mjs exact design-system --config examples/config.yaml --json
node skills/stash/scripts/stash.mjs search "frontend component tokens" --config examples/config.yaml --json
```

직접 보관함을 추가하려면 [설정](skills/stash/references/CONFIGURATION.md)과
[보관함 형식](docs/catalog-format.md)을 참고하세요.

## 관리형 비활성 스킬

관리형 보관소는 catalog 설정 없이 사용할 수 있습니다. 생명주기 명령은 로컬
스킬 디렉터리를 입력받으며 외부 catalog 원본을 보존합니다.

```bash
stash install /path/to/rare-skill
stash status rare-skill
stash activate rare-skill --host codex
stash deactivate rare-skill --host codex
```

`archive`는 사용자가 정확히 고른 독립 호스트 스킬을 보관한 뒤 원본을
제거하는 파괴적 변형입니다. `update`는 기존 관리형 사본만 교체하며 배포본을
자동으로 덮어쓰지 않습니다. 원격 저장소 내용은 CLI에 전달하기 전에 로컬
임시 경로에 준비해 검토해야 합니다.

변경 전제조건, provenance, 결과 상태, 일괄 업데이트, 지원 대상은
[CLI 계약](skills/stash/references/CLI-CONTRACT.md)이 기준입니다. 명령 문법은
`stash help`가 기준입니다.

## 호스트 지원

| 호스트 | 명시 호출 | 자동 선택 |
|---|---|---|
| Codex | `$stash ...` | `allow_implicit_invocation: false`로 차단 |
| Claude Code | `/stash:stash ...` | `disable-model-invocation: true`로 차단 |
| Antigravity IDE | 요청에서 `stash`를 이름으로 언급 | 스킬 단위 수동 호출 설정이 문서화되지 않음 |
| Antigravity CLI | `/stash ...` | 스킬 단위 수동 호출 설정이 문서화되지 않음 |

Antigravity 생성 어댑터는 지원을 선언하기 전에 대상 `agy` 버전에서 직접
확인해야 합니다.

## 범위

- 외부 catalog는 읽기 전용이며, 등록만으로 쓰기 권한이 생기지 않습니다.
- 쓰기는 Stash 관리형 루트와 명시적 생명주기 요청이 정확히 선택한 지원 대상
  독립 스킬로 제한합니다.
- 네트워크, embedding 모델, vector database, telemetry, 별도 LLM 라우터를
  사용하지 않습니다.
- 스킬을 읽는 동안 포함된 스크립트를 실행하지 않습니다.
- 마켓플레이스, 자동 원격 업데이트 도구, 샌드박스, 권한 시스템, 보안 검사기,
  플러그인 관리자 또는 호스트 설정 관리자가 아닙니다.

## 문서

- [설치](docs/installation.md)
- [CLI 계약](skills/stash/references/CLI-CONTRACT.md)
- [설정](skills/stash/references/CONFIGURATION.md)
- [아키텍처](docs/architecture.md)
- [보관함 형식](docs/catalog-format.md)
- [검색 방식](docs/routing.md)
- [호스트 지원](docs/vendor-support.md)
- [보안](SECURITY.md)
- [유지보수](docs/maintenance.md)

## 라이선스

MIT
