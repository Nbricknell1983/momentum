import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

const CLI_TIMEOUT_MS = 60_000;
const HTTP_TIMEOUT_MS = 60_000;

export interface RunnerResult {
  success: boolean;
  output: Record<string, any> | null;
  raw: string;
  error?: string;
  via: 'cli' | 'http' | 'none';
}

/**
 * Invoke an OpenClaw specialist agent.
 *
 * Primary path: runs the CLI command
 *   openclaw agent --agent AGENT_ID --message "MESSAGE" --json
 *
 * Fallback path: if the CLI binary is not found, calls the HTTP API at the
 * configured OpenClaw base URL using the OPENCLAW_API_KEY secret.
 */
export async function runOpenClawAgent(
  agentId: string,
  message: string,
  openclawBaseUrl?: string | null
): Promise<RunnerResult> {
  const apiKey = process.env.OPENCLAW_API_KEY || '';

  // ── Primary: CLI ────────────────────────────────────────────────────────────
  const safeMessage = message.replace(/"/g, '\\"');
  const command = `openclaw agent --agent ${agentId} --message "${safeMessage}" --json`;

  try {
    console.log(`[openclaw-runner] CLI → agent=${agentId}`);
    const { stdout, stderr } = await execAsync(command, {
      timeout: CLI_TIMEOUT_MS,
      env: { ...process.env, OPENCLAW_API_KEY: apiKey },
    });
    if (stderr) console.warn(`[openclaw-runner] CLI stderr: ${stderr.slice(0, 500)}`);
    const raw = stdout.trim();
    let output: Record<string, any> = { rawText: raw };
    try { output = JSON.parse(raw); } catch { /* keep rawText fallback */ }
    console.log(`[openclaw-runner] CLI success → agent=${agentId}`);
    return { success: true, output, raw, via: 'cli' };
  } catch (cliErr: any) {
    const isNotInstalled =
      cliErr.code === 127 ||
      (cliErr.message || '').includes('not found') ||
      (cliErr.message || '').includes('ENOENT') ||
      (cliErr.message || '').includes('command not found');

    if (!isNotInstalled) {
      // CLI ran but returned a non-zero exit — treat as execution failure
      const error = cliErr.stderr || cliErr.message || 'OpenClaw CLI failed';
      console.error(`[openclaw-runner] CLI execution error: ${error}`);
      return { success: false, output: null, raw: '', error, via: 'cli' };
    }

    console.warn('[openclaw-runner] CLI not installed — attempting HTTP fallback');
  }

  // ── Fallback: HTTP API ───────────────────────────────────────────────────────
  const baseUrl = openclawBaseUrl || null;
  if (!baseUrl) {
    return {
      success: false,
      output: null,
      raw: '',
      error: 'OpenClaw CLI not installed and no baseUrl configured. Add openclawConfig.baseUrl via the OpenClaw Setup page.',
      via: 'none',
    };
  }

  try {
    const url = `${baseUrl.replace(/\/$/, '')}/api/agent/run`;
    console.log(`[openclaw-runner] HTTP → ${url} agent=${agentId}`);
    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-openclaw-key': apiKey,
      },
      body: JSON.stringify({ agentId, message }),
      signal: AbortSignal.timeout(HTTP_TIMEOUT_MS),
    });
    const body = await resp.text();
    if (!resp.ok) {
      throw new Error(`HTTP ${resp.status}: ${body.slice(0, 300)}`);
    }
    let output: Record<string, any> = { rawText: body };
    try { output = JSON.parse(body); } catch { /* keep rawText fallback */ }
    console.log(`[openclaw-runner] HTTP success → agent=${agentId}`);
    return { success: true, output, raw: body, via: 'http' };
  } catch (httpErr: any) {
    const error = `HTTP fallback failed: ${httpErr.message}`;
    console.error(`[openclaw-runner] ${error}`);
    return { success: false, output: null, raw: '', error, via: 'http' };
  }
}
