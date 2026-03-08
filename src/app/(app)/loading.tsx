export default function AppLoading() {
  return (
    <div className="trip-wrap-center">
      <div
        className="roam-spin"
        style={{
          width: 28,
          height: 28,
          border: "3px solid var(--roam-border, #ddd)",
          borderTopColor: "var(--roam-accent, #42b159)",
          borderRadius: "50%",
          animation: "roam-spin 0.6s linear infinite",
        }}
      />
    </div>
  );
}
