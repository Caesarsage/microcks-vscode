import { ChildProcess } from "child_process";
import { ServicesProvider } from "../views/services";
import { TestsProvider } from "../views/tests";

interface ActiveDryRunWatch {
  process: ChildProcess;
  provider: ServicesProvider;
  testsProvider: TestsProvider;
  forceStopTimer?: ReturnType<typeof setTimeout>;
}

let activeDryRunWatch: ActiveDryRunWatch | undefined;

export function getActiveDryRunWatch(): ActiveDryRunWatch | undefined {
  return activeDryRunWatch;
}

export function setActiveDryRunWatch(watch: ActiveDryRunWatch | undefined): void {
  activeDryRunWatch = watch;
}

export function disposeActiveDryRunWatch(): void {
  const watch = activeDryRunWatch;
  if (!watch) {
    return;
  }
  if (watch.forceStopTimer) {
    clearTimeout(watch.forceStopTimer);
  }
  watch.provider.markDryRunStopped();
  watch.testsProvider.markDryRunStopped();
  watch.process.kill("SIGINT");
  activeDryRunWatch = undefined;
}
