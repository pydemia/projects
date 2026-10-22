import { paletteTokens, type ColorOverrides } from "./pydemia-ui/foundation/design-modes";

// User-provided pydemia.xml, preserved in the colormap-management registry.
// Colors: https://colors.pydemia.ai/; source roles remain exact sRGB values.
export const pydemiaPalette = {
    id: "pydemia",
    swatches: ["#DAE3F3", "#7597D2", "#3863AF", "#001760", "#9D0101", "#D6604D"],
    roles: {
        dk1: "#242424", lt1: "#FFFFFF", dk2: "#44546A", lt2: "#E7E6E6",
        accent1: "#DAE3F3", accent2: "#7597D2", accent3: "#3863AF",
        accent4: "#001760", accent5: "#9D0101", accent6: "#D6604D",
        hlink: "#0563C1", folHlink: "#954F72",
    },
} as const;

function mix(first: string, second: string, amount: number): string {
    const channels = [1, 3, 5].map(start => Math.round(
        parseInt(first.slice(start, start + 2), 16) * (1 - amount)
        + parseInt(second.slice(start, start + 2), 16) * amount,
    ).toString(16).padStart(2, "0"));
    return "#" + channels.join("").toUpperCase();
}

const roles = pydemiaPalette.roles;
const darkCanvas = mix(roles.accent4, roles.dk1, 0.75);

export const pydemiaGlassColors: ColorOverrides = {
    light: {
        ...paletteTokens.neutral.light,
        "--background": mix(roles.accent1, roles.lt1, 0.7),
        "--surface": roles.lt1,
        "--surface-subtle": roles.accent1,
        "--foreground": roles.accent4,
        "--muted": roles.dk2,
        "--border": mix(roles.accent2, roles.lt1, 0.55),
        "--accent": roles.accent3,
        "--accent-foreground": roles.lt1,
        "--focus": roles.hlink,
        "--danger": roles.accent5,
        "--message-user-background": roles.accent4,
        "--message-user-foreground": roles.lt1,
    },
    dark: {
        ...paletteTokens.neutral.dark,
        "--background": darkCanvas,
        "--surface": mix(darkCanvas, roles.accent1, 0.06),
        "--surface-subtle": mix(darkCanvas, roles.accent1, 0.12),
        "--foreground": roles.accent1,
        "--muted": mix(roles.accent2, roles.accent1, 0.4),
        "--border": mix(darkCanvas, roles.accent2, 0.4),
        "--accent": roles.accent2,
        "--accent-foreground": roles.accent4,
        "--focus": roles.accent1,
        "--danger": mix(roles.accent6, roles.accent1, 0.3),
        "--message-user-background": roles.accent3,
        "--message-user-foreground": roles.lt1,
    },
};
