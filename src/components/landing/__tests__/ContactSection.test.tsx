import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// Track call order to ensure toast fires BEFORE the form unmounts
const callOrder: string[] = [];

const invokeMock = vi.fn(async (..._args: unknown[]) => {
  callOrder.push("invoke");
  return { data: { success: true }, error: null };
});

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { functions: { invoke: (...args: unknown[]) => invokeMock(...args) } },
}));

const useToastMock = vi.fn((..._args: unknown[]) => {
  callOrder.push("useToast.toast");
});
vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: useToastMock }),
}));

const sonnerSuccessMock = vi.fn((..._args: unknown[]) => {
  callOrder.push("sonner.success");
});
vi.mock("sonner", () => ({
  toast: {
    success: (...args: unknown[]) => sonnerSuccessMock(...args),
    error: vi.fn(),
  },
}));

import { ContactSection } from "../ContactSection";

describe("ContactSection success flow", () => {
  beforeEach(() => {
    callOrder.length = 0;
    invokeMock.mockClear();
    useToastMock.mockClear();
    sonnerSuccessMock.mockClear();
  });

  it("fires toast BEFORE switching to success state (form unmount)", async () => {
    const user = userEvent.setup();
    render(<ContactSection />);

    await user.type(screen.getByLabelText(/Nombre/i), "Juan Pérez");
    await user.type(screen.getByLabelText(/Email/i), "juan@example.com");
    await user.type(screen.getByLabelText(/Mensaje/i), "Hola, me interesa RepIndex.");

    await user.click(screen.getByRole("button", { name: /Enviar mensaje/i }));

    // Wait for the success state to render
    await waitFor(() => {
      expect(screen.getByText(/¡Mensaje enviado!/i)).toBeInTheDocument();
    });

    // Edge function was invoked
    expect(invokeMock).toHaveBeenCalledTimes(1);

    // Both toast systems were notified
    expect(useToastMock).toHaveBeenCalledTimes(1);
    expect(sonnerSuccessMock).toHaveBeenCalledTimes(1);

    // Critical: toasts fired AFTER invoke but BEFORE the form unmount
    // (i.e. before React paints the success view). Since setStatus("success")
    // happens after both toast calls in onSubmit, callOrder must have both
    // toast entries present immediately after invoke resolved.
    const invokeIdx = callOrder.indexOf("invoke");
    const useToastIdx = callOrder.indexOf("useToast.toast");
    const sonnerIdx = callOrder.indexOf("sonner.success");
    expect(invokeIdx).toBeGreaterThanOrEqual(0);
    expect(useToastIdx).toBeGreaterThan(invokeIdx);
    expect(sonnerIdx).toBeGreaterThan(invokeIdx);

    // Form is no longer mounted (success view replaced it)
    expect(screen.queryByLabelText(/Mensaje \*/i)).not.toBeInTheDocument();
  });
});