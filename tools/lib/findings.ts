// Parsers that turn each tool's output into a common list of findings.
import { relative } from "node:path";
import { asArray, asNumber, asRecord, asString } from "./json.ts";

export interface Finding {
  tool: string;
  rule: string;
  file: string;
  line?: number;
  blocking: boolean;
}

function rel(root: string, file: string): string {
  return file.startsWith("/") ? relative(root, file) : file;
}

export function parseTsc(text: string): Finding[] {
  const findings: Finding[] = [];
  for (const line of text.split("\n")) {
    const match = /^(.+?)\((\d+),\d+\): error (TS\d+):/.exec(line);
    if (match?.[1] !== undefined && match[3] !== undefined) {
      findings.push({
        tool: "tsc",
        rule: match[3],
        file: match[1],
        line: Number(match[2]),
        blocking: true,
      });
    }
  }
  return findings;
}

export function parseEslint(data: unknown, root: string): Finding[] {
  return asArray(data).flatMap((entry) => {
    const file = rel(root, asString(asRecord(entry).filePath));
    return asArray(asRecord(entry).messages).map((raw) => {
      const message = asRecord(raw);
      return {
        tool: "eslint",
        rule: asString(message.ruleId, "parse-error"),
        file,
        line: asNumber(message.line),
        blocking: asNumber(message.severity) >= 2,
      };
    });
  });
}

export function parsePrettier(text: string): Finding[] {
  return text
    .split("\n")
    .map((line) => /^\[warn\] (.+)$/.exec(line)?.[1])
    .filter((file): file is string => file !== undefined && !file.startsWith("Code style issues"))
    .map((file) => ({ tool: "prettier", rule: "formato", file, blocking: true }));
}

export function parseVitest(data: unknown, root: string): Finding[] {
  return asArray(asRecord(data).testResults).flatMap((suite) => {
    const file = rel(root, asString(asRecord(suite).name));
    return asArray(asRecord(suite).assertionResults)
      .map(asRecord)
      .filter((test) => asString(test.status) === "failed")
      .map((test) => ({
        tool: "vitest",
        rule: asString(test.fullName, "prueba"),
        file,
        blocking: true,
      }));
  });
}

export function parseKnip(data: unknown): Finding[] {
  const findings: Finding[] = [];
  for (const raw of asArray(asRecord(data).issues)) {
    const issue = asRecord(raw);
    const file = asString(issue.file);
    for (const [kind, value] of Object.entries(issue)) {
      for (const item of asArray(value)) {
        const name = asString(asRecord(item).name);
        if (name !== "")
          findings.push({ tool: "knip", rule: `${kind}: ${name}`, file, blocking: false });
      }
    }
  }
  for (const file of asArray(asRecord(data).files)) {
    findings.push({ tool: "knip", rule: "archivo sin uso", file: asString(file), blocking: false });
  }
  return findings;
}

const BLOCKING_AUDIT = new Set(["moderate", "high", "critical"]);

export function parseNpmAudit(data: unknown): Finding[] {
  return Object.entries(asRecord(asRecord(data).vulnerabilities)).map(([name, raw]) => {
    const severity = asString(asRecord(raw).severity, "unknown");
    return {
      tool: "npm audit",
      rule: `${name} (${severity})`,
      file: "package-lock.json",
      blocking: BLOCKING_AUDIT.has(severity),
    };
  });
}

export function parseSemgrep(data: unknown): Finding[] {
  return asArray(asRecord(data).results).map((raw) => {
    const result = asRecord(raw);
    const severity = asString(asRecord(result.extra).severity);
    return {
      tool: "semgrep",
      rule: asString(result.check_id).split(".").slice(-1)[0] ?? "regla",
      file: asString(result.path),
      line: asNumber(asRecord(result.start).line),
      blocking: severity === "ERROR" || severity === "WARNING",
    };
  });
}

export function parseGitleaks(data: unknown, root: string): Finding[] {
  return asArray(data).map((raw) => {
    const leak = asRecord(raw);
    const commit = asString(leak.Commit);
    return {
      tool: "gitleaks",
      rule:
        commit === ""
          ? asString(leak.RuleID)
          : `${asString(leak.RuleID)} (commit ${commit.slice(0, 7)})`,
      file: rel(root, asString(leak.File).replace(/^\/src\//, "")),
      line: asNumber(leak.StartLine),
      blocking: true,
    };
  });
}

export function parseOsv(data: unknown): Finding[] {
  return asArray(asRecord(data).results).flatMap((raw) => {
    const result = asRecord(raw);
    const file = asString(asRecord(result.source).path).replace(/^\/src\//, "");
    return asArray(result.packages).flatMap((pkgRaw) => {
      const pkg = asRecord(pkgRaw);
      const name = asString(asRecord(pkg.package).name);
      return asArray(pkg.vulnerabilities).map((vuln) => ({
        tool: "osv-scanner",
        rule: `${name}: ${asString(asRecord(vuln).id)}`,
        file,
        blocking: true,
      }));
    });
  });
}

export function parseHadolint(data: unknown): Finding[] {
  return asArray(data).map((raw) => {
    const item = asRecord(raw);
    const level = asString(item.level);
    return {
      tool: "hadolint",
      rule: asString(item.code),
      file: asString(item.file),
      line: asNumber(item.line),
      blocking: level === "error" || level === "warning",
    };
  });
}

export function parseTrivyConfig(data: unknown): Finding[] {
  return asArray(asRecord(data).Results).flatMap((raw) => {
    const result = asRecord(raw);
    return asArray(result.Misconfigurations).map((miscRaw) => {
      const misc = asRecord(miscRaw);
      const severity = asString(misc.Severity);
      return {
        tool: "trivy",
        rule: `${asString(misc.ID)} (${severity})`,
        file: asString(result.Target),
        blocking: severity === "HIGH" || severity === "CRITICAL",
      };
    });
  });
}

export function parsePrivacy(data: unknown): Finding[] {
  return asArray(data).map((raw) => {
    const hit = asRecord(raw);
    return {
      tool: "privacidad",
      rule: "término privado",
      file: asString(hit.file),
      line: asNumber(hit.line),
      blocking: true,
    };
  });
}
