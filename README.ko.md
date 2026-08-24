# Stash

[English](README.md) | 한국어

Stash는 `$stash`로 호출합니다. 자주 사용하지 않는
[`SKILL.md`](https://agentskills.io) 패키지를 제품의 기본 검색 경로 밖에
두고, 사용자가 명시적으로 호출하면 정확한 이름으로 스킬을 열거나 작업
내용으로 로컬 보관함을 검색합니다.

```text
$stash design-system
→ 정확한 이름의 저장된 스킬 열기

$stash API 문서 검토에 필요한 스킬을 모두 찾아줘
→ 실질적으로 관련된 저장 스킬 전체 반환
```

Stash는 로컬에서 검색하고 모든 외부 보관함을 읽기 전용으로 다루며, 선택한
지침만 불러옵니다. 별도의 관리형 보관소에는 명시적으로 가져온 독립 스킬을
호스트에 배포하기 전까지 비활성 상태로 둘 수 있습니다. 검색 자체는 스킬을
다운로드·설치·업데이트·실행하지 않습니다.

## 왜 필요한가요?

활성화된 스킬은 전체 지침을 선택된 뒤에 읽더라도 이름과 설명은 평소 검색에
사용됩니다. 활성화된 스킬이 많아지면 다음 문제가 생길 수 있습니다.

- 스킬 목록 메타데이터가 차지하는 범위 증가
- 비슷한 설명으로 인한 잘못된 스킬 선택
- 의도하지 않은 자동 호출 가능성 증가
- 트리거와 설명의 유지보수 부담 증가

스킬이 몇 개일 때 문제가 된다는 고정 기준은 없습니다. 스킬 수가 적고 역할이
명확하며 이름을 기억한다면 제품의 기본 수동 호출 옵션만 사용하는 편이 더
단순합니다.

Stash는 많은 로컬 스킬을 제품에 하나씩 등록하지 않고 이름, 별칭, 분류 또는
작업 내용으로 찾고 싶을 때 사용합니다.

```text
제품의 기본 검색
├── 평소 사용하는 스킬
└── Stash
     └── 명시 요청 → 로컬 보관함 → 선택한 SKILL.md
```

## 동작 방식

1. 평소 사용하는 스킬은 제품의 기본 스킬 폴더에 둡니다.
2. 가끔 사용하는 스킬은 Stash 관리형 보관소로 가져오거나 기존 읽기 전용
   보관함을 설정합니다.
3. 사용자가 Stash를 명시적으로 호출합니다.
4. 정확한 이름을 확인하거나 로컬 어휘 검색을 실행합니다.
5. 선택한 `SKILL.md`와 필요한 참고 파일만 읽습니다.

정확한 이름은 항상 결정적인 경로로 먼저 찾습니다. 관련 스킬 전체를 요청하면
상위 5개로 자르지 않고 모든 결과 페이지를 확인합니다.

## 빠른 시작

Node.js 20 이상이 필요합니다.

```bash
npm install
npm run test:all
```

포함된 예제 보관함을 확인합니다.

```bash
node skills/stash/scripts/stash.mjs doctor --config examples/config.yaml
node skills/stash/scripts/stash.mjs exact design-system --config examples/config.yaml --json
node skills/stash/scripts/stash.mjs search "frontend component tokens" --config examples/config.yaml --json
node skills/stash/scripts/stash.mjs list --source example --config examples/config.yaml --json
```

선택적인 `stash.meta.yaml`에 안정적인 `source.id`와 저장소 표시명 또는 URL을 기록할 수 있습니다. `--source`에는 이 중 하나를 정확히 입력하면 되며 catalog나 group은 바뀌지 않습니다.

보관함 설정 파일:

```yaml
version: 1
catalogs:
  - id: personal
    root: "D:/skills/stash"
    enabled: true
    trust: reviewed
    followSymlinks: false
defaults:
  pageSize: 40
  materialScoreThreshold: 2
```

`STASH_CONFIG`에 설정 파일 경로를 지정합니다. 한 번만 사용할 때는
`--root <보관함-경로>`를 사용할 수 있습니다.

### 관리형 비활성 스킬

관리형 보관소는 별도 catalog 설정 없이 바로 쓸 수 있습니다. `install`은
로컬 스킬 디렉터리를 복사하고 원본은 그대로 둡니다.

```bash
stash install D:/downloads/rare-skill
stash update D:/staging/rare-skill-v2 \
  --expected-tree-hash <current-hash> \
  --expected-revision <current-revision> \
  --revision <new-revision>
stash archive old-skill --host codex
stash status rare-skill
stash activate rare-skill --host codex
stash deactivate rare-skill --host codex
```

`install`, `import`, `add`는 같은 명령입니다. `archive`는 파괴적 변형으로,
명시적으로 선택한 독립 스킬을 검증해 보관한 뒤 호스트 검색 경로의 원본을
제거합니다. 이미 검증된 Stash 소유 배포본이면 canonical 사본을 유지한 채
`deactivate`와 같은 추적 철회를 수행합니다. 플러그인에 포함된 스킬은
관리하지 않습니다. `activate` 결과는 `deployed`로 기록하며 호스트의 별도
활성·비활성 설정까지 켜졌다고 단정하지 않습니다.

CLI는 로컬 디렉터리만 가져옵니다. 사용자가 Stash 스킬에 저장소의 특정
스킬을 명시적으로 가져오라고 요청하면, 에이전트가 호스트 검색 경로 밖에
고정 revision을 임시로 준비하고 검토한 뒤 그 로컬 경로를 `install`에
전달할 수 있습니다. 설정된 catalog 안의 스킬도 원본을 변경하지 않고
설치할 수 있습니다. `update`도 같은 원칙으로 기존 관리형 사본만 교체하며,
호출자가 확인한 현재 트리 해시와 기록된 경우 현재 revision을 요구하고 원본
내용이나 revision을 바꿀 때 기록된 원본 URL도 요구합니다. 원본 식별자가
달라지면 거부합니다. 트리가 같고 revision만 바뀐 경우에는 파일을
다시 복사하지 않고 메타데이터만 갱신합니다. 내용이 달라지면 staging 사본을
재검증한 뒤 복구 journal이 보장하는 transaction으로 교체합니다. 기존
배포본은 자동으로 덮어쓰지 않고 outdated 상태로 보고하며, 사용자가 명시적으로
deactivate 후 activate해야 새 내용으로 바뀝니다. 같은 원본이나 Stash 소유
배포본이 catalog 검색에도 나오면 해시가 일치할 때 관리형 canonical 결과의
관련 사본으로 접습니다.
변경되었거나 연관되지 않은 사본은 별도 결과와 경고로 남깁니다.

생명주기 CLI 입력은 로컬 전용입니다. 원격 URL 입력, 심볼릭 링크 배포,
보호되지 않은 덮어쓰기, 플러그인 변경, 벤더 설정 변경, workspace 생명주기
대상은 지원하지 않습니다. Antigravity CLI의 독립 스킬 형식은 문서상
디렉터리가 아닌 단일 Markdown 파일이므로 생명주기 명령의 대상으로 사용할
수 없습니다.

## 제품별 지원

| 제품 | 명시 호출 | 자동 선택 |
|---|---|---|
| Codex | `$stash ...` | `allow_implicit_invocation: false`로 차단 |
| Claude Code | `/stash:stash ...` | `disable-model-invocation: true`로 차단 |
| Antigravity IDE | 요청에서 `stash`를 이름으로 언급 | 스킬 단위 수동 호출 설정이 문서화되지 않음 |
| Antigravity CLI | `/stash ...` | 스킬 단위 수동 호출 설정이 문서화되지 않음 |

Antigravity 어댑터는 생성되지만, 지원을 공개하기 전에 대상 `agy` 버전에서
직접 검증해야 합니다.

## 범위

- catalog 작업은 외부 원본 보관함을 읽기 전용으로 유지합니다. 쓰기는 외부
  보관함과 겹치지 않는 Stash 관리형 보관소와, 사용자가 정확히 선택한 독립
  스킬 생명주기 대상에만 허용합니다.
- 네트워크, embedding 모델, vector database, 별도 LLM 라우터를 사용하지
  않습니다.
- 스킬을 읽으면서 포함된 스크립트를 실행하지 않습니다.
- 마켓플레이스, 자동 원격 업데이트 도구, 권한 시스템, 샌드박스 또는 보안
  검사기가 아닙니다. 플러그인 생명주기는 각 호스트가 관리합니다.

## 문서

- [설치](docs/installation.md)
- [아키텍처](docs/architecture.md)
- [보관함 형식](docs/catalog-format.md)
- [검색 방식](docs/routing.md)
- [제품 지원](docs/vendor-support.md)
- [보안](SECURITY.md)
- [유지보수](docs/maintenance.md)
- [유사 프로젝트](docs/alternatives.md)

## 라이선스

MIT
