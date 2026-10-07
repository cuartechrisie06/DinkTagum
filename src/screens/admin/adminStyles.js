import { StyleSheet } from "react-native";
import { C, S } from "../shared";

export const adminStyles = StyleSheet.create({
  // Form section dividers
  formSection: {
    marginTop: S.xl,
  },
  formSectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: S.md,
    gap: S.sm,
  },
  formSectionLine: {
    flex: 1,
    height: 1,
    backgroundColor: C.line,
  },
  formSectionTitle: {
    color: C.textDim,
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1.2,
    textTransform: "uppercase",
  },

  // Field hint text
  fieldHint: {
    color: C.textFaint,
    fontSize: 11.5,
    marginTop: 2,
    lineHeight: 15,
  },

  // Photo gallery manager
  galleryManager: {
    gap: S.md,
  },
  galleryScroll: {
    marginHorizontal: -S.xs,
  },
  galleryScrollContent: {
    paddingHorizontal: S.xs,
    gap: S.sm,
  },
  galleryThumbWrapper: {
    width: 100,
    height: 80,
    borderRadius: 10,
    overflow: "hidden",
    position: "relative",
    backgroundColor: C.surface2,
  },
  galleryThumb: {
    width: "100%",
    height: "100%",
  },
  coverBadge: {
    position: "absolute",
    top: 4,
    left: 4,
    backgroundColor: C.volt,
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 2,
  },
  coverBadgeText: {
    color: C.ink,
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  thumbActions: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    justifyContent: "space-between",
    backgroundColor: "rgba(6,35,29,0.72)",
    paddingHorizontal: 4,
    paddingVertical: 3,
  },
  thumbActionBtn: {
    width: 24,
    height: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  thumbRemoveBtn: {
    backgroundColor: "rgba(220,50,50,0.7)",
    borderRadius: 12,
  },
  galleryEmpty: {
    height: 80,
    borderWidth: 1,
    borderColor: C.lineStrong,
    borderStyle: "dashed",
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    gap: S.xs,
  },
  galleryEmptyText: {
    color: C.textFaint,
    fontSize: 12.5,
  },
  uploadBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: S.sm,
    borderWidth: 1.5,
    borderColor: C.volt,
    borderRadius: 10,
    paddingVertical: S.md,
    paddingHorizontal: S.lg,
  },
  uploadBtnText: {
    color: C.volt,
    fontSize: 14,
    fontWeight: "700",
  },
  urlPasteRow: {
    flexDirection: "row",
    gap: S.sm,
    alignItems: "center",
  },
  urlAddBtn: {
    width: 44,
    height: 44,
    borderRadius: 10,
    backgroundColor: C.volt,
    alignItems: "center",
    justifyContent: "center",
  },

  // Court admin row
  courtRow: {
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: 14,
    marginTop: S.md,
    overflow: "hidden",
  },
  courtThumb: {
    width: 60,
    height: 60,
    borderRadius: 14,
    overflow: "hidden",
    flexShrink: 0,
  },
  courtThumbImg: {
    width: "100%",
    height: "100%",
  },
  courtThumbPlaceholder: {
    width: "100%",
    height: "100%",
    backgroundColor: C.surface2,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 90,
  },
  courtRowHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingTop: S.md,
    paddingHorizontal: S.md,
    gap: S.md,
  },
  courtRowName: {
    color: C.paper,
    fontSize: 15,
    fontWeight: "700",
  },
  courtRowMeta: {
    color: C.textDim,
    fontSize: 12.5,
    marginTop: S.sm,
    paddingHorizontal: S.md,
  },
  courtRowPricing: {
    flexDirection: "row",
    gap: S.md,
    paddingHorizontal: S.md,
    marginTop: S.xs,
  },
  courtRowPricingItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  courtRowPricingText: {
    color: C.textDim,
    fontSize: 12,
    fontWeight: "600",
  },
  courtRowActions: {
    flexDirection: "row",
    gap: 0,
    paddingHorizontal: S.md,
    paddingVertical: S.md,
    borderTopWidth: 1,
    borderColor: C.line,
    marginTop: S.sm,
  },
  courtActionBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    paddingVertical: 6,
  },
  courtActionBtnText: {
    color: C.volt,
    fontSize: 12.5,
    fontWeight: "700",
  },
  amenityPill: {
    backgroundColor: C.surface2,
    borderRadius: 20,
    paddingHorizontal: S.sm,
    paddingVertical: 3,
  },
  amenityPillText: {
    color: C.mist,
    fontSize: 11,
    fontWeight: "600",
  },
});
