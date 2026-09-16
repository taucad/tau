// @vitest-environment jsdom
import { MemoryRouter } from "react-router";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createQuantity, quantityKinds } from "@taucad/units/quantity";
import { afterEach, describe, expect, it, vi } from "vitest";
import X1cMachineDemoRoute from "#routes/x1c/route.js";

const quantity = (
  input: Readonly<{
    value: number;
    unit: string;
    kind: string;
    space: "linear" | "point";
  }>,
) => {
  const result = createQuantity({ ...input, semanticMode: "declared-only" });
  if (result.status !== "success") {
    throw new TypeError("TEST_QUANTITY_INVALID");
  }
  return result.value;
};

describe("X1cMachineDemoRoute", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    globalThis.history.replaceState({}, "", "/x1c");
  });

  it("should expose read-only machine capabilities without enabling physical controls", async () => {
    render(
      <MemoryRouter>
        <X1cMachineDemoRoute />
      </MemoryRouter>,
    );

    expect(
      screen.getByRole("heading", { name: "X1C machine console" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("article", { name: "Workshop X1C, Printing" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Thermal" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Automatic Material System" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Pause" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Urgent stop" })).toBeDisabled();

    await userEvent.click(
      screen.getByRole("button", { name: "Refresh status" }),
    );
    expect(
      await screen.findByText(
        "Status refreshed from the sample MachineClient.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        /Upload, print start, pause, cancel, and urgent stop remain unavailable/iu,
      ),
    ).toBeInTheDocument();
  });

  it("should consume an origin-scoped grant and display bounded live printer data", async () => {
    const grant = "x".repeat(43);
    const capturedAt = new Date().toISOString();
    const expiresAt = new Date(Date.now() + 15_000).toISOString();
    const fetchMock = vi.fn<typeof fetch>(async (input) => {
      const requestUrl =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.href
            : input.url;
      if (requestUrl.endsWith("/status")) {
        return new Response(
          JSON.stringify({
            machineId: "workshop-x1c",
            descriptor: {
              name: "Workshop X1C",
              vendor: "Bambu Lab",
              model: "X1C",
              firmware: "01.12.00.00",
              technology: "additive.fff",
              accepts: [],
              operations: ["observe", "still"],
              ratedEnvelope: {
                width: 0.256,
                depth: 0.256,
                height: 0.256,
                unit: "m",
              },
              printableEnvelope: {
                width: 0.256,
                depth: 0.256,
                height: 0.256,
                unit: "m",
              },
              tools: [
                {
                  id: "tool-0",
                  kind: "extruder",
                  nozzleDiameter: quantity({
                    value: 0.4,
                    unit: "mm",
                    kind: quantityKinds.diameter,
                    space: "linear",
                  }),
                },
              ],
              materialSystem: { kind: "ams", slotCount: 16 },
              bedTypes: ["textured-plate"],
            },
            snapshot: {
              connection: "connected",
              readiness: "idle",
              observedAt: capturedAt,
              setup: {
                toolId: "tool-0",
                materials: [
                  { slot: 0, state: "loaded", materialId: "PETG" },
                  { slot: 1, state: "loaded", materialId: "PETG" },
                  { slot: 2, state: "empty" },
                  { slot: 3, state: "loaded", materialId: "PETG" },
                ],
              },
              run: {
                state: "idle",
                name: "Calibration cube",
                file: "cube.gcode.3mf",
                currentLayer: 12,
                totalLayers: 120,
                speedProfile: "standard",
                speedPercent: 100,
              },
              temperatures: {
                nozzle: quantity({
                  value: 25,
                  unit: "Cel",
                  kind: quantityKinds.temperature,
                  space: "point",
                }),
                nozzleTarget: quantity({
                  value: 220,
                  unit: "Cel",
                  kind: quantityKinds.temperature,
                  space: "point",
                }),
                bed: quantity({
                  value: 24,
                  unit: "Cel",
                  kind: quantityKinds.temperature,
                  space: "point",
                }),
                bedTarget: quantity({
                  value: 65,
                  unit: "Cel",
                  kind: quantityKinds.temperature,
                  space: "point",
                }),
                chamber: quantity({
                  value: 23,
                  unit: "Cel",
                  kind: quantityKinds.temperature,
                  space: "point",
                }),
              },
              fans: { part: 100, auxiliary: 40, chamber: 0 },
              materialSystem: {
                currentSlot: 3,
                targetSlot: 3,
                units: [
                  {
                    unit: 0,
                    humidityIndex: 3,
                    temperature: quantity({
                      value: 22,
                      unit: "Cel",
                      kind: quantityKinds.temperature,
                      space: "point",
                    }),
                  },
                ],
              },
              network: { wifiSignalDbm: -47 },
              lights: { chamber: "on" },
              removableStorage: "present",
              alerts: [],
            },
            camera: { state: "ready", startedAt: capturedAt, capturedAt },
          }),
          { headers: { "content-type": "application/json" } },
        );
      }
      return new Response(Uint8Array.from([0xff, 0xd8, 0xff, 0xd9]), {
        headers: {
          "content-type": "image/jpeg",
          "x-tau-captured-at": capturedAt,
          "x-tau-expires-at": expiresAt,
        },
      });
    });
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:x1c-live");
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
    globalThis.history.replaceState({}, "", `/x1c#live=${grant}`);

    render(
      <MemoryRouter>
        <X1cMachineDemoRoute />
      </MemoryRouter>,
    );

    expect(await screen.findByText("Live read-only view")).toBeInTheDocument();
    expect(
      await screen.findByRole("article", { name: "Workshop X1C, Idle" }),
    ).toBeInTheDocument();
    expect(await screen.findByText("25°")).toBeInTheDocument();
    expect(screen.getAllByText("PETG")).toHaveLength(3);
    expect(screen.getByText("None")).toBeInTheDocument();
    expect(screen.getByText("12 / 120")).toBeInTheDocument();
    expect(screen.getByText("-47 dBm")).toBeInTheDocument();
    expect(screen.getByText("No active diagnostics")).toBeInTheDocument();
    expect(
      await screen.findByRole("img", {
        name: "Latest live view of the X1C build chamber",
      }),
    ).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      "http://127.0.0.1:4174/still",
      expect.objectContaining({
        headers: { Authorization: `Bearer ${grant}` },
      }),
    );
    expect(globalThis.location.hash).toBe("");
  });
});
