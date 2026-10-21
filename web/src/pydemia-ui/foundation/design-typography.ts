import type { DesignModeId } from "./design-modes";

export type DesignTypography = { headline: string; ui: string; data: string };

/** Approved public families; actual faces and notices are listed in research/design-fonts.json. */
export const designTypography: Record<Exclude<DesignModeId, "basic">, DesignTypography> = {
    "glass": {
        "headline": "Manrope",
        "ui": "Work Sans",
        "data": "Work Sans"
    },
    "material": {
        "headline": "Work Sans",
        "ui": "Work Sans",
        "data": "Work Sans"
    },
    "fluent": {
        "headline": "Manrope",
        "ui": "Work Sans",
        "data": "Work Sans"
    },
    "neumorphic": {
        "headline": "Manrope",
        "ui": "Work Sans",
        "data": "Work Sans"
    },
    "flat": {
        "headline": "Work Sans",
        "ui": "Work Sans",
        "data": "Work Sans"
    },
    "bento": {
        "headline": "Work Sans",
        "ui": "Work Sans",
        "data": "Work Sans"
    },
    "brutal": {
        "headline": "Jost",
        "ui": "Work Sans",
        "data": "Work Sans"
    },
    "clay": {
        "headline": "Manrope",
        "ui": "Work Sans",
        "data": "Work Sans"
    },
    "skeuo": {
        "headline": "Source Serif 4",
        "ui": "Work Sans",
        "data": "Work Sans"
    },
    "dark-ui": {
        "headline": "Manrope",
        "ui": "Work Sans",
        "data": "Work Sans"
    },
    "minimal": {
        "headline": "Work Sans",
        "ui": "Work Sans",
        "data": "Work Sans"
    },
    "swiss": {
        "headline": "Work Sans",
        "ui": "Work Sans",
        "data": "Work Sans"
    },
    "editorial": {
        "headline": "Source Serif 4",
        "ui": "Work Sans",
        "data": "Work Sans"
    },
    "aurora": {
        "headline": "Manrope",
        "ui": "Work Sans",
        "data": "Work Sans"
    },
    "cyber": {
        "headline": "Rajdhani",
        "ui": "Work Sans",
        "data": "JetBrains Mono"
    },
    "terminal": {
        "headline": "JetBrains Mono",
        "ui": "JetBrains Mono",
        "data": "JetBrains Mono"
    },
    "retro": {
        "headline": "Jost",
        "ui": "Work Sans",
        "data": "JetBrains Mono"
    },
    "pixel": {
        "headline": "JetBrains Mono",
        "ui": "Work Sans",
        "data": "JetBrains Mono"
    },
    "drawn": {
        "headline": "Source Serif 4",
        "ui": "Work Sans",
        "data": "Work Sans"
    },
    "spatial": {
        "headline": "Manrope",
        "ui": "Work Sans",
        "data": "Work Sans"
    }
};
