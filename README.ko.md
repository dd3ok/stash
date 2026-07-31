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

Stash는 로컬에서 검색하고 원본 보관함을 읽기 전용으로 다루며, 선택한
지침만 불러옵니다. 검색 중 스킬을 다운로드·설치·업데이트·실행하지
않습니다.

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
2. 가끔 사용하는 스킬은 Stash에 설정한 별도 폴더에 둡니다.
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

- 원본 보관함은 읽기 전용으로 유지합니다.
- 네트워크, embedding 모델, vector database, 별도 LLM 라우터를 사용하지
  않습니다.
- 스킬을 읽으면서 포함된 스크립트를 실행하지 않습니다.
- 설치기, 업데이트 도구, 마켓플레이스, 권한 시스템, 샌드박스 또는 보안
  검사기가 아닙니다.

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
