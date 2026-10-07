jest.mock("../../lib/supabase", () => ({ isSupabaseConfigured: true, supabase: null }));
jest.mock("../context/AuthContext", () => ({ useAuth: () => ({}) }));
const { validateAuthFields } = require("./AuthScreen");

describe("validateAuthFields", () => {
  it("requires email and password to log in, and checks the email shape", () => {
    expect(validateAuthFields({ registering: false, email: "", password: "" })).toEqual({ email: expect.any(String), password: expect.any(String) });
    expect(validateAuthFields({ registering: false, email: "ana@", password: "x" }).email).toMatch(/email address/);
    expect(validateAuthFields({ registering: false, email: " ana@example.com ", password: "x" })).toEqual({});
  });

  it("needs a name and a strong password to sign up", () => {
    const errors = validateAuthFields({ registering: true, displayName: " ", email: "ana@example.com", password: "weak" });
    expect(Object.keys(errors).sort()).toEqual(["displayName", "password"]);
    expect(validateAuthFields({ registering: true, displayName: "Ana", email: "ana@example.com", password: "Str0ngPass" })).toEqual({});
  });
});
