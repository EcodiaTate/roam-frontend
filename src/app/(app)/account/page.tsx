// src/app/(app)/account/page.tsx
//
// Account & Settings page.
// Google Play requires: sign-out, account deletion, and a link to
// request data deletion without deleting the account.

import { useCallback, useState } from "react";
import { useNavigate } from "react-router";
import { ArrowLeft, LogOut, Trash2, Mail, Shield, ExternalLink } from "lucide-react";
import { useAuth } from "@/lib/supabase/auth";
import { haptic } from "@/lib/native/haptics";

export default function AccountPage() {
  const { user, session, signOut, deleteAccount } = useAuth();
  const navigate = useNavigate();

  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSignOut = useCallback(async () => {
    haptic.medium();
    await signOut();
    navigate("/login", { replace: true });
  }, [signOut, navigate]);

  const handleDelete = useCallback(async () => {
    if (!confirmDelete) {
      haptic.warning();
      setConfirmDelete(true);
      return;
    }
    haptic.medium();
    setDeleting(true);
    setError(null);
    const { error: err } = await deleteAccount();
    if (err) {
      haptic.error();
      setError(err);
      setDeleting(false);
      setConfirmDelete(false);
    } else {
      haptic.success();
      navigate("/login", { replace: true });
    }
  }, [confirmDelete, deleteAccount, navigate]);

  const email = user?.email ?? session?.user?.email ?? null;

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        bottom: "var(--bottom-nav-height, 80px)",
        overflowY: "auto",
        WebkitOverflowScrolling: "touch" as const,
        background: "var(--roam-bg)",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: "16px 20px 12px",
          flexShrink: 0,
        }}
      >
        <button
          type="button"
          onClick={() => { haptic.light(); navigate(-1); }}
          style={{
            width: 40,
            height: 40,
            borderRadius: "50%",
            border: "none",
            background: "var(--roam-surface)",
            color: "var(--roam-text)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
            flexShrink: 0,
          }}
          aria-label="Go back"
        >
          <ArrowLeft size={18} />
        </button>
        <h1
          style={{
            margin: 0,
            fontSize: 20,
            fontWeight: 800,
            color: "var(--roam-text)",
          }}
        >
          Account
        </h1>
      </div>

      <div style={{ padding: "0 20px", display: "flex", flexDirection: "column", gap: 8 }}>

        {/* Account info */}
        {email && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 14,
              padding: "16px",
              borderRadius: "var(--r-card)",
              background: "var(--roam-surface)",
            }}
          >
            <div
              style={{
                width: 40,
                height: 40,
                borderRadius: "50%",
                background: "var(--accent-tint)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "var(--roam-accent)",
                flexShrink: 0,
              }}
            >
              <Mail size={18} />
            </div>
            <div style={{ minWidth: 0 }}>
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 800,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  color: "var(--roam-text-muted)",
                  marginBottom: 2,
                }}
              >
                Signed in as
              </div>
              <div
                style={{
                  fontSize: 14,
                  fontWeight: 700,
                  color: "var(--roam-text)",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {email}
              </div>
            </div>
          </div>
        )}

        {/* Sign out */}
        <button
          type="button"
          onClick={handleSignOut}
          className="trip-interactive"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 14,
            width: "100%",
            padding: "16px",
            borderRadius: "var(--r-card)",
            background: "var(--roam-surface)",
            border: "none",
            cursor: "pointer",
            textAlign: "left",
          }}
        >
          <div
            style={{
              width: 40,
              height: 40,
              borderRadius: "50%",
              background: "var(--info-tint)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "var(--roam-info)",
              flexShrink: 0,
            }}
          >
            <LogOut size={18} />
          </div>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: "var(--roam-text)" }}>
              Sign out
            </div>
            <div style={{ fontSize: 12, color: "var(--roam-text-muted)", lineHeight: 1.4 }}>
              Sign out of your Roam account on this device
            </div>
          </div>
        </button>

        {/* Legal links */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            borderRadius: "var(--r-card)",
            background: "var(--roam-surface)",
            overflow: "hidden",
          }}
        >
          {[
            { href: "/privacy", label: "Privacy Policy", icon: Shield },
            { href: "/terms", label: "Terms & Conditions", icon: ExternalLink },
            { href: "/contact", label: "Contact & Support", icon: Mail },
          ].map(({ href, label, icon: Icon }, i, arr) => (
            <a
              key={href}
              href={href}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 14,
                padding: "14px 16px",
                textDecoration: "none",
                color: "var(--roam-text)",
                fontSize: 14,
                fontWeight: 600,
                borderBottom: i < arr.length - 1 ? "1px solid var(--roam-border)" : "none",
              }}
            >
              <Icon size={16} style={{ color: "var(--roam-text-muted)", flexShrink: 0 }} />
              {label}
            </a>
          ))}
        </div>

        {/* Delete account */}
        <div style={{ marginTop: 16 }}>
          <div
            style={{
              fontSize: 11,
              fontWeight: 800,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              color: "var(--roam-text-muted)",
              marginBottom: 8,
              paddingLeft: 4,
            }}
          >
            Account management
          </div>

          <div
            style={{
              borderRadius: "var(--r-card)",
              background: "var(--roam-surface)",
              padding: "16px",
              display: "flex",
              flexDirection: "column",
              gap: 12,
            }}
          >
            <div style={{ display: "flex", alignItems: "flex-start", gap: 14 }}>
              <div
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: "50%",
                  background: "var(--danger-tint)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "var(--roam-danger)",
                  flexShrink: 0,
                }}
              >
                <Trash2 size={18} />
              </div>
              <div>
                <div style={{ fontSize: 15, fontWeight: 700, color: "var(--roam-text)" }}>
                  Delete account
                </div>
                <div style={{ fontSize: 12, color: "var(--roam-text-muted)", lineHeight: 1.5, marginTop: 2 }}>
                  Permanently delete your account and all associated data including trips,
                  saved places, emergency contacts, and plan history. This cannot be undone.
                </div>
              </div>
            </div>

            {error && (
              <div
                style={{
                  padding: "10px 14px",
                  borderRadius: "var(--r-card)",
                  background: "var(--bg-error)",
                  color: "var(--text-error)",
                  fontSize: 13,
                  fontWeight: 600,
                  textAlign: "center",
                }}
              >
                {error}
              </div>
            )}

            {!confirmDelete ? (
              <button
                type="button"
                onClick={handleDelete}
                disabled={deleting}
                style={{
                  width: "100%",
                  padding: "14px",
                  borderRadius: "var(--r-btn)",
                  border: "1px solid var(--roam-danger)",
                  background: "transparent",
                  color: "var(--roam-danger)",
                  fontSize: 14,
                  fontWeight: 700,
                  cursor: "pointer",
                  WebkitTapHighlightColor: "transparent",
                }}
              >
                Delete my account
              </button>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <div
                  style={{
                    padding: "10px 14px",
                    borderRadius: "var(--r-card)",
                    background: "var(--bg-error)",
                    color: "var(--text-error)",
                    fontSize: 13,
                    fontWeight: 700,
                    textAlign: "center",
                    lineHeight: 1.4,
                  }}
                >
                  Are you sure? This will permanently delete your account and all your data.
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    type="button"
                    onClick={() => { haptic.light(); setConfirmDelete(false); }}
                    disabled={deleting}
                    style={{
                      flex: 1,
                      padding: "14px",
                      borderRadius: "var(--r-btn)",
                      border: "none",
                      background: "var(--roam-surface-hover)",
                      color: "var(--roam-text)",
                      fontSize: 14,
                      fontWeight: 700,
                      cursor: "pointer",
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleDelete}
                    disabled={deleting}
                    style={{
                      flex: 1,
                      padding: "14px",
                      borderRadius: "var(--r-btn)",
                      border: "none",
                      background: "var(--roam-danger)",
                      color: "var(--on-color)",
                      fontSize: 14,
                      fontWeight: 700,
                      cursor: "pointer",
                      opacity: deleting ? 0.6 : 1,
                    }}
                  >
                    {deleting ? "Deleting..." : "Yes, delete everything"}
                  </button>
                </div>
              </div>
            )}

            {/* Data-only deletion link (Google Play requirement) */}
            <a
              href="/contact?category=data-request"
              style={{
                fontSize: 12,
                fontWeight: 600,
                color: "var(--roam-text-muted)",
                textAlign: "center",
                textDecoration: "none",
                opacity: 0.8,
                marginTop: 4,
              }}
            >
              Request data deletion without deleting your account
            </a>
          </div>
        </div>
      </div>

      {/* Bottom padding */}
      <div style={{ height: 32, flexShrink: 0 }} />
    </div>
  );
}
