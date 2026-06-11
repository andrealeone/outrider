import { Box, Text, useInput } from "ink";
import React, { useEffect, useState } from "react";

import type { ServiceDefinition } from "../../shared/types/protocol";
import type { ServiceEntry } from "../../shared/types/registry";
import type { DaemonHook } from "../use-daemon";

import { theme } from "../theme";
import { TextInput } from "./text-input";

interface Props {
  daemon: DaemonHook;
  active: boolean;
  /** When set, the form edits this entry in place (name locked). */
  edit?: ServiceEntry;
  onDone: () => void;
}

const RESTART_OPTIONS = ["no", "on_failure", "always"] as const;

const FIELDS = [
  "name",
  "command",
  "workingDir",
  "route",
  "restart",
  "autostart",
  "submit",
] as const;

type Field = (typeof FIELDS)[number];

/** Form wizard for a standalone service, validated live against the daemon. */
export const AddService = ({ daemon, active, edit, onDone }: Props) => {
  const editing = edit !== undefined;
  const [field, setField] = useState<Field>(editing ? "command" : "name");
  const [name, setName] = useState(edit?.name ?? "");
  const [command, setCommand] = useState(edit?.config.command ?? "");
  const [workingDir, setWorkingDir] = useState(edit?.config.working_dir ?? "");
  const [route, setRoute] = useState(edit?.route?.route ?? "");
  const [restartIndex, setRestartIndex] = useState(
    Math.max(
      0,
      RESTART_OPTIONS.indexOf(
        (edit?.config.availability?.restart ?? "no") as never,
      ),
    ),
  );
  const [autostart, setAutostart] = useState(edit?.autostart ?? false);
  const [errors, setErrors] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const definition = (): ServiceDefinition => ({
    name: name.trim(),
    command: command.trim(),
    workingDir: workingDir.trim() === "" ? undefined : workingDir.trim(),
    route: route.trim() === "" ? undefined : route.trim(),
    restart: RESTART_OPTIONS[restartIndex % RESTART_OPTIONS.length],
    autostart,
  });

  // Live validation against the daemon as the form changes.
  useEffect(() => {
    if (name.trim() === "" && command.trim() === "") return undefined;
    const timer = setTimeout(() => {
      void (async () => {
        setErrors(await daemon.validateService(definition(), edit?.id));
      })();
    }, 250);
    return () => {
      clearTimeout(timer);
    };
  }, [name, command, workingDir, route]);

  const move = (delta: number): void => {
    // The name field is locked while editing, so navigation starts at 1.
    const min = editing ? 1 : 0;
    const index = FIELDS.indexOf(field);
    setField(
      FIELDS[
        Math.max(min, Math.min(FIELDS.length - 1, index + delta))
      ] as Field,
    );
  };

  const submit = async (): Promise<void> => {
    if (submitting) return;
    setSubmitting(true);
    const def = definition();
    const error = editing
      ? await daemon.updateService(edit.id, def)
      : await daemon.addService(def);
    setSubmitting(false);
    if (error === undefined) onDone();
    else setErrors([error]);
  };

  useInput(
    (input, key) => {
      if (key.escape) onDone();
      else if (key.tab && key.shift) move(-1);
      else if (key.tab || (key.return && field !== "submit")) move(1);
      else if (
        field === "restart" &&
        (input === " " || key.leftArrow || key.rightArrow)
      ) {
        setRestartIndex((i) => i + 1);
      } else if (field === "autostart" && input === " ")
        setAutostart((a) => !a);
      else if (field === "submit" && key.return) void submit();
    },
    { isActive: active },
  );

  const textField = (
    label: string,
    value: string,
    onChange: (v: string) => void,
    own: Field,
    placeholder: string,
  ) => (
    <Box>
      <Box width={14}>
        <Text color={field === own ? theme.accent : theme.dim}>
          {field === own ? "› " : "  "}
          {label}
        </Text>
      </Box>
      <TextInput
        value={value}
        onChange={onChange}
        active={active && field === own}
        placeholder={placeholder}
      />
    </Box>
  );

  return (
    <Box flexDirection="column" padding={1}>
      <Text bold color={theme.accent}>
        {editing ? `edit service · ${edit.id}` : "add service"}
      </Text>
      <Text color={theme.dim}>
        tab/enter to move, esc to cancel
        {editing
          ? " · the name is fixed; a running service restarts on save"
          : ""}
      </Text>
      <Box marginTop={1} flexDirection="column">
        {editing ? (
          <Box>
            <Box width={14}>
              <Text color={theme.dim}> name</Text>
            </Box>
            <Text color={theme.dim}>{name} (locked)</Text>
          </Box>
        ) : (
          textField("name", name, setName, "name", "api")
        )}
        {textField(
          "command",
          command,
          setCommand,
          "command",
          "bun run server.ts",
        )}
        {textField(
          "working dir",
          workingDir,
          setWorkingDir,
          "workingDir",
          "(home)",
        )}
        {textField(
          "route",
          route,
          setRoute,
          "route",
          "(none — e.g. api → api.localhost)",
        )}
        <Box>
          <Box width={14}>
            <Text color={field === "restart" ? theme.accent : theme.dim}>
              {field === "restart" ? "› " : "  "}restart
            </Text>
          </Box>
          <Text>
            {RESTART_OPTIONS[restartIndex % RESTART_OPTIONS.length]} (space
            cycles)
          </Text>
        </Box>
        <Box>
          <Box width={14}>
            <Text color={field === "autostart" ? theme.accent : theme.dim}>
              {field === "autostart" ? "› " : "  "}autostart
            </Text>
          </Box>
          <Text>{autostart ? "yes" : "no"} (space toggles)</Text>
        </Box>
        <Box marginTop={1}>
          <Text bold color={field === "submit" ? theme.accent : theme.dim}>
            {field === "submit" ? "› " : "  "}
            {submitting ? "Saving…" : editing ? "Save changes" : "Save service"}
          </Text>
        </Box>
      </Box>
      {errors.length > 0 ? (
        <Box flexDirection="column" marginTop={1}>
          {errors.map((e) => (
            <Text key={e} color={theme.error}>
              ✗ {e}
            </Text>
          ))}
        </Box>
      ) : null}
    </Box>
  );
};
