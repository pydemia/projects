import type { Appearance, ColorPalette, DesignModeId } from './design-modes';

export type DesignDefaultColormap = { id: string; name: string; harmony: string; seeds: readonly string[]; swatches: Record<Appearance, readonly string[]>; colors: Record<Appearance, ColorPalette>; source: { atlasSha256: string; generator: string; colorsCommit: string }; reason: string };

/** Generated from research/design-default-colormaps.json; no runtime Colors dependency. */
export const designDefaultColormaps: Record<Exclude<DesignModeId, 'basic'>, DesignDefaultColormap> = {
    "glass": {
        "id": "atlas-glass",
        "name": "Prismatic Glass",
        "harmony": "analogous",
        "seeds": [
            "#7150C8",
            "#278ED0",
            "#D77BCB"
        ],
        "swatches": {
            "light": [
                "#7150C8",
                "#278ED0",
                "#D77BCB",
                "#EBF2FF",
                "#0C1021",
                "#967D92"
            ],
            "dark": [
                "#7150C8",
                "#278ED0",
                "#D77BCB",
                "#190C1B",
                "#EDF1FF",
                "#6C5568"
            ]
        },
        "colors": {
            "light": {
                "--background": "#F1EFFF",
                "--foreground": "#272339",
                "--surface": "#FFFFFF",
                "--surface-subtle": "#E8E6FA",
                "--border": "#C9C5E2",
                "--muted": "#5F5B74",
                "--accent": "#7150C8",
                "--accent-foreground": "#FFFFFF",
                "--message-user-background": "#3B276F",
                "--message-user-foreground": "#FFFFFF",
                "--focus": "#7150C8",
                "--danger": "#A8324C",
                "--success": "#236645",
                "--warning": "#8B5A06"
            },
            "dark": {
                "--background": "#181428",
                "--foreground": "#F1EFFF",
                "--surface": "#262238",
                "--surface-subtle": "#332F46",
                "--border": "#5A566F",
                "--muted": "#C2BEDB",
                "--accent": "#917FD7",
                "--accent-foreground": "#151B23",
                "--message-user-background": "#4B3882",
                "--message-user-foreground": "#FFFFFF",
                "--focus": "#7461B6",
                "--danger": "#FF9EB8",
                "--success": "#8DD9AC",
                "--warning": "#F2C46F"
            }
        },
        "source": {
            "atlasSha256": "bb06d329ecc9a933c0c3046af4666066e0bdc3f5ba560ac005ccb9a6f662a295",
            "generator": "colors.pydemia.ai · intent-2.0.0",
            "colorsCommit": "ec79fce0ab8bae28b244d5f9fe27baee7fb291a1"
        },
        "reason": "인디고·블루·마젠타의 이웃한 빛을 유리 뒤 배경에 두고, 카드 전경은 맑은 중성 표면으로 분리합니다."
    },
    "material": {
        "id": "atlas-material",
        "name": "Indigo Roles",
        "harmony": "complementary",
        "seeds": [
            "#263B76",
            "#6040D8",
            "#F2764C"
        ],
        "swatches": {
            "light": [
                "#263B76",
                "#6040D8",
                "#F2764C",
                "#FEF1D2",
                "#170C1C",
                "#6A8D97"
            ],
            "dark": [
                "#263B76",
                "#6040D8",
                "#F2764C",
                "#130E1F",
                "#F0F0FF",
                "#42646E"
            ]
        },
        "colors": {
            "light": {
                "--background": "#F3F6FD",
                "--foreground": "#171E30",
                "--surface": "#FFFFFF",
                "--surface-subtle": "#E6ECF9",
                "--border": "#CBD5EC",
                "--muted": "#555E74",
                "--accent": "#263B76",
                "--accent-foreground": "#FFFFFF",
                "--message-user-background": "#1F336D",
                "--message-user-foreground": "#FFFFFF",
                "--focus": "#263B76",
                "--danger": "#A8324C",
                "--success": "#236645",
                "--warning": "#8B5A06"
            },
            "dark": {
                "--background": "#101521",
                "--foreground": "#EBF0FA",
                "--surface": "#181E2D",
                "--surface-subtle": "#242C3E",
                "--border": "#424C62",
                "--muted": "#B6BFD5",
                "--accent": "#6984C5",
                "--accent-foreground": "#151B23",
                "--message-user-background": "#2E447F",
                "--message-user-foreground": "#FFFFFF",
                "--focus": "#5069A8",
                "--danger": "#FF9EB8",
                "--success": "#8DD9AC",
                "--warning": "#F2C46F"
            }
        },
        "source": {
            "atlasSha256": "bb06d329ecc9a933c0c3046af4666066e0bdc3f5ba560ac005ccb9a6f662a295",
            "generator": "colors.pydemia.ai · intent-2.0.0",
            "colorsCommit": "ec79fce0ab8bae28b244d5f9fe27baee7fb291a1"
        },
        "reason": "짙은 파랑 계열의 역할색에 주황을 제한된 보조 액션으로 두어 역할 토큰의 대비를 만듭니다."
    },
    "fluent": {
        "id": "atlas-fluent",
        "name": "Woodland Acrylic",
        "harmony": "analogous",
        "seeds": [
            "#244D76",
            "#318E9B",
            "#36795B"
        ],
        "swatches": {
            "light": [
                "#244D76",
                "#318E9B",
                "#36795B",
                "#DFF7FF",
                "#02131F",
                "#708E7E"
            ],
            "dark": [
                "#244D76",
                "#318E9B",
                "#36795B",
                "#0F0F21",
                "#E5F4FF",
                "#486556"
            ]
        },
        "colors": {
            "light": {
                "--background": "#F2F5F8",
                "--foreground": "#1F2A36",
                "--surface": "#FBFCFE",
                "--surface-subtle": "#E8EDF3",
                "--border": "#CBD4DF",
                "--muted": "#566575",
                "--accent": "#244D76",
                "--accent-foreground": "#FFFFFF",
                "--message-user-background": "#0F3961",
                "--message-user-foreground": "#FFFFFF",
                "--focus": "#244D76",
                "--danger": "#A52B3A",
                "--success": "#236645",
                "--warning": "#8B5A06"
            },
            "dark": {
                "--background": "#161D25",
                "--foreground": "#EFF4F9",
                "--surface": "#202A35",
                "--surface-subtle": "#2A3643",
                "--border": "#475768",
                "--muted": "#B6C2CF",
                "--accent": "#6893C0",
                "--accent-foreground": "#151B23",
                "--message-user-background": "#214A73",
                "--message-user-foreground": "#FFFFFF",
                "--focus": "#4B75A1",
                "--danger": "#FF9B9F",
                "--success": "#8DD9AC",
                "--warning": "#F2C46F"
            }
        },
        "source": {
            "atlasSha256": "bb06d329ecc9a933c0c3046af4666066e0bdc3f5ba560ac005ccb9a6f662a295",
            "generator": "colors.pydemia.ai · intent-2.0.0",
            "colorsCommit": "ec79fce0ab8bae28b244d5f9fe27baee7fb291a1"
        },
        "reason": "자연 배경과 청록 아크릴의 차분한 청록-녹색 범위를 사용하고, 흐림은 일시적 표면에만 남깁니다."
    },
    "neumorphic": {
        "id": "atlas-neumorphic",
        "name": "Soft Slate",
        "harmony": "monochromatic",
        "seeds": [
            "#DDE0E9",
            "#AEB6C8",
            "#66748F"
        ],
        "swatches": {
            "light": [
                "#DDE0E9",
                "#AEB6C8",
                "#66748F",
                "#EDF1FF",
                "#130E1F",
                "#7986A0"
            ],
            "dark": [
                "#DDE0E9",
                "#AEB6C8",
                "#66748F",
                "#140E1E",
                "#ECF2FF",
                "#515E76"
            ]
        },
        "colors": {
            "light": {
                "--background": "#E5E8ED",
                "--foreground": "#303640",
                "--surface": "#E5E8ED",
                "--surface-subtle": "#E5E8ED",
                "--border": "#D5D9DF",
                "--muted": "#5A616D",
                "--accent": "#5B6984",
                "--accent-foreground": "#FFFFFF",
                "--message-user-background": "#2C3850",
                "--message-user-foreground": "#FFFFFF",
                "--focus": "#66748F",
                "--danger": "#A22C36",
                "--success": "#236645",
                "--warning": "#8B5A06"
            },
            "dark": {
                "--background": "#262A32",
                "--foreground": "#E7EAF0",
                "--surface": "#262A32",
                "--surface-subtle": "#262A32",
                "--border": "#353B46",
                "--muted": "#BAC1CD",
                "--accent": "#8493AF",
                "--accent-foreground": "#151B23",
                "--message-user-background": "#3B4861",
                "--message-user-foreground": "#FFFFFF",
                "--focus": "#66748F",
                "--danger": "#FF9AA0",
                "--success": "#8DD9AC",
                "--warning": "#F2C46F"
            }
        },
        "source": {
            "atlasSha256": "bb06d329ecc9a933c0c3046af4666066e0bdc3f5ba560ac005ccb9a6f662a295",
            "generator": "colors.pydemia.ai · intent-2.0.0",
            "colorsCommit": "ec79fce0ab8bae28b244d5f9fe27baee7fb291a1"
        },
        "reason": "단일 청회색 바탕에서 명도와 안팎 그림자로 입체감을 만듭니다. 색차는 좁게 유지하고 포커스는 분명히 합니다."
    },
    "flat": {
        "id": "atlas-flat",
        "name": "Teal Coral",
        "harmony": "triadic",
        "seeds": [
            "#00BFA5",
            "#F0786B",
            "#F0C95B"
        ],
        "swatches": {
            "light": [
                "#00BFA5",
                "#F0786B",
                "#F0C95B",
                "#F3EFFF",
                "#1D0D03",
                "#A48100"
            ],
            "dark": [
                "#00BFA5",
                "#F0786B",
                "#F0C95B",
                "#001519",
                "#ECF2FF",
                "#735A00"
            ]
        },
        "colors": {
            "light": {
                "--background": "#F3F8F7",
                "--foreground": "#0C2D27",
                "--surface": "#FFFFFF",
                "--surface-subtle": "#E3F3EF",
                "--border": "#C3DCD6",
                "--muted": "#43645C",
                "--accent": "#008472",
                "--accent-foreground": "#FFFFFF",
                "--message-user-background": "#004238",
                "--message-user-foreground": "#FFFFFF",
                "--focus": "#00A68F",
                "--danger": "#A52B3A",
                "--success": "#236645",
                "--warning": "#8B5A06"
            },
            "dark": {
                "--background": "#03201B",
                "--foreground": "#E7F7F3",
                "--surface": "#0B2C26",
                "--surface-subtle": "#1A3A33",
                "--border": "#3B5B54",
                "--muted": "#A6CAC1",
                "--accent": "#00BFA5",
                "--accent-foreground": "#151B23",
                "--message-user-background": "#005448",
                "--message-user-foreground": "#FFFFFF",
                "--focus": "#00BFA5",
                "--danger": "#FF9B9F",
                "--success": "#8DD9AC",
                "--warning": "#F2C46F"
            }
        },
        "source": {
            "atlasSha256": "bb06d329ecc9a933c0c3046af4666066e0bdc3f5ba560ac005ccb9a6f662a295",
            "generator": "colors.pydemia.ai · intent-2.0.0",
            "colorsCommit": "ec79fce0ab8bae28b244d5f9fe27baee7fb291a1"
        },
        "reason": "청록·코랄·노랑의 분명한 색면을 구획과 상태에 배정하고 그림자 대신 형태·글자 위계를 씁니다."
    },
    "bento": {
        "id": "atlas-bento",
        "name": "Blue Modules",
        "harmony": "monochromatic",
        "seeds": [
            "#167DE2",
            "#42A8F0",
            "#E6E8EA"
        ],
        "swatches": {
            "light": [
                "#167DE2",
                "#42A8F0",
                "#E6E8EA",
                "#E9F3FF",
                "#0D1021",
                "#73899F"
            ],
            "dark": [
                "#167DE2",
                "#42A8F0",
                "#E6E8EA",
                "#100F20",
                "#E7F4FF",
                "#4B6075"
            ]
        },
        "colors": {
            "light": {
                "--background": "#F3F5F8",
                "--foreground": "#202C3A",
                "--surface": "#FFFFFF",
                "--surface-subtle": "#E9EDF3",
                "--border": "#D0D8E2",
                "--muted": "#576576",
                "--accent": "#3776BE",
                "--accent-foreground": "#FFFFFF",
                "--message-user-background": "#00376D",
                "--message-user-foreground": "#FFFFFF",
                "--focus": "#167DE2",
                "--danger": "#A22C36",
                "--success": "#236645",
                "--warning": "#8B5A06"
            },
            "dark": {
                "--background": "#151C25",
                "--foreground": "#F0F3F7",
                "--surface": "#202A36",
                "--surface-subtle": "#293544",
                "--border": "#455365",
                "--muted": "#B9C3D0",
                "--accent": "#5595E0",
                "--accent-foreground": "#151B23",
                "--message-user-background": "#074786",
                "--message-user-foreground": "#FFFFFF",
                "--focus": "#167DE2",
                "--danger": "#FF9AA0",
                "--success": "#8DD9AC",
                "--warning": "#F2C46F"
            }
        },
        "source": {
            "atlasSha256": "bb06d329ecc9a933c0c3046af4666066e0bdc3f5ba560ac005ccb9a6f662a295",
            "generator": "colors.pydemia.ai · intent-2.0.0",
            "colorsCommit": "ec79fce0ab8bae28b244d5f9fe27baee7fb291a1"
        },
        "reason": "파랑의 명도 단계로 타일의 우선순위를 보조하고, 카드 크기와 배치가 주된 위계를 맡도록 합니다."
    },
    "brutal": {
        "id": "atlas-brutal",
        "name": "Ink and Apricot",
        "harmony": "complementary",
        "seeds": [
            "#FFF9E9",
            "#202A35",
            "#904315"
        ],
        "swatches": {
            "light": [
                "#FFF9E9",
                "#202A35",
                "#904315",
                "#EDF2FF",
                "#0F0F21",
                "#6C8C9A"
            ],
            "dark": [
                "#FFF9E9",
                "#202A35",
                "#904315",
                "#101403",
                "#E8F3FF",
                "#446370"
            ]
        },
        "colors": {
            "light": {
                "--background": "#FFF9E9",
                "--foreground": "#202A35",
                "--surface": "#FFFFFF",
                "--surface-subtle": "#F2F4F6",
                "--border": "#202A35",
                "--muted": "#52606D",
                "--accent": "#904315",
                "--accent-foreground": "#FFFFFF",
                "--message-user-background": "#103344",
                "--message-user-foreground": "#FFFFFF",
                "--focus": "#176C8A",
                "--danger": "#A22C36",
                "--success": "#236645",
                "--warning": "#8B5A06"
            },
            "dark": {
                "--background": "#131A21",
                "--foreground": "#E9EEF2",
                "--surface": "#1B242D",
                "--surface-subtle": "#25313B",
                "--border": "#46545F",
                "--muted": "#AFBEC9",
                "--accent": "#FFBD7C",
                "--accent-foreground": "#13232D",
                "--message-user-background": "#245D70",
                "--message-user-foreground": "#FFFFFF",
                "--focus": "#9AD6EB",
                "--danger": "#FF9AA0",
                "--success": "#8DD9AC",
                "--warning": "#F2C46F"
            }
        },
        "source": {
            "atlasSha256": "bb06d329ecc9a933c0c3046af4666066e0bdc3f5ba560ac005ccb9a6f662a295",
            "generator": "colors.pydemia.ai · intent-2.0.0",
            "colorsCommit": "ec79fce0ab8bae28b244d5f9fe27baee7fb291a1"
        },
        "reason": "현재 크림색·잉크색·구운 주황 조합을 그대로 앵커로 사용합니다. 새 프로필 값을 기존 값 위에 덮어쓰지 말고 이 조합과 단단한 경계를 보존합니다."
    },
    "clay": {
        "id": "atlas-clay",
        "name": "Mint Rose Clay",
        "harmony": "splitComplementary",
        "seeds": [
            "#FFF1D9",
            "#86DCC5",
            "#F29AB0"
        ],
        "swatches": {
            "light": [
                "#FFF1D9",
                "#86DCC5",
                "#F29AB0",
                "#E3F5FF",
                "#001518",
                "#9D7C83"
            ],
            "dark": [
                "#FFF1D9",
                "#86DCC5",
                "#F29AB0",
                "#121302",
                "#FFEDEB",
                "#73545B"
            ]
        },
        "colors": {
            "light": {
                "--background": "#FFF3F5",
                "--foreground": "#3F2A2F",
                "--surface": "#FFF9FA",
                "--surface-subtle": "#FAE8EC",
                "--border": "#E8CFD4",
                "--muted": "#765B61",
                "--accent": "#AB5A70",
                "--accent-foreground": "#FFFFFF",
                "--message-user-background": "#621832",
                "--message-user-foreground": "#FFFFFF",
                "--focus": "#CC788E",
                "--danger": "#A8324C",
                "--success": "#236645",
                "--warning": "#8B5A06"
            },
            "dark": {
                "--background": "#2B1B1F",
                "--foreground": "#F9EEF0",
                "--surface": "#3A2329",
                "--surface-subtle": "#482F35",
                "--border": "#664A50",
                "--muted": "#D6BFC4",
                "--accent": "#F29AB0",
                "--accent-foreground": "#151B23",
                "--message-user-background": "#752941",
                "--message-user-foreground": "#FFFFFF",
                "--focus": "#F29AB0",
                "--danger": "#FF9EB8",
                "--success": "#8DD9AC",
                "--warning": "#F2C46F"
            }
        },
        "source": {
            "atlasSha256": "bb06d329ecc9a933c0c3046af4666066e0bdc3f5ba560ac005ccb9a6f662a295",
            "generator": "colors.pydemia.ai · intent-2.0.0",
            "colorsCommit": "ec79fce0ab8bae28b244d5f9fe27baee7fb291a1"
        },
        "reason": "크림색 바탕을 중심에 두고 민트와 핑크/코랄 파스텔을 푹신한 오브젝트에 분배합니다. 평상시 데이터 표면은 평평하게 유지합니다."
    },
    "skeuo": {
        "id": "atlas-skeuo",
        "name": "Brushed Steel",
        "harmony": "monochromatic",
        "seeds": [
            "#E5E8EC",
            "#AAB7C7",
            "#668BA7"
        ],
        "swatches": {
            "light": [
                "#E5E8EC",
                "#AAB7C7",
                "#668BA7",
                "#EAF3FF",
                "#100F20",
                "#708A9E"
            ],
            "dark": [
                "#E5E8EC",
                "#AAB7C7",
                "#668BA7",
                "#100F20",
                "#E9F3FF",
                "#486174"
            ]
        },
        "colors": {
            "light": {
                "--background": "#DAE6F0",
                "--foreground": "#262C31",
                "--surface": "#EBF5FC",
                "--surface-subtle": "#CDDBE6",
                "--border": "#93A4B1",
                "--muted": "#586169",
                "--accent": "#4F738E",
                "--accent-foreground": "#FFFFFF",
                "--message-user-background": "#183B54",
                "--message-user-foreground": "#FFFFFF",
                "--focus": "#668BA7",
                "--danger": "#A33438",
                "--success": "#236645",
                "--warning": "#8B5A06"
            },
            "dark": {
                "--background": "#1E272D",
                "--foreground": "#E7EFF5",
                "--surface": "#28323A",
                "--surface-subtle": "#35424C",
                "--border": "#5E6F7C",
                "--muted": "#B9C9D5",
                "--accent": "#789DBA",
                "--accent-foreground": "#151B23",
                "--message-user-background": "#284C65",
                "--message-user-foreground": "#FFFFFF",
                "--focus": "#668BA7",
                "--danger": "#FF9DA0",
                "--success": "#8DD9AC",
                "--warning": "#F2C46F"
            }
        },
        "source": {
            "atlasSha256": "bb06d329ecc9a933c0c3046af4666066e0bdc3f5ba560ac005ccb9a6f662a295",
            "generator": "colors.pydemia.ai · intent-2.0.0",
            "colorsCommit": "ec79fce0ab8bae28b244d5f9fe27baee7fb291a1"
        },
        "reason": "회청색 금속/법랑 기기면에 일관된 명암 bevel을 주고, 실제 값이 연결된 조작부의 표시색은 파랑으로 제한합니다."
    },
    "dark-ui": {
        "id": "atlas-dark-ui",
        "name": "Carbon Neutral",
        "harmony": "monochromatic",
        "seeds": [
            "#101417",
            "#1B2328",
            "#E9EFEF"
        ],
        "swatches": {
            "light": [
                "#101417",
                "#1B2328",
                "#E9EFEF",
                "#E6F4FF",
                "#0A1121",
                "#688E8F"
            ],
            "dark": [
                "#101417",
                "#1B2328",
                "#E9EFEF",
                "#0C1021",
                "#E4F5FF",
                "#406566"
            ]
        },
        "colors": {
            "light": {
                "--background": "#F7F8FA",
                "--foreground": "#202A35",
                "--surface": "#FFFFFF",
                "--surface-subtle": "#F2F4F6",
                "--border": "#D6DCE2",
                "--muted": "#52606D",
                "--accent": "#707676",
                "--accent-foreground": "#FFFFFF",
                "--message-user-background": "#343939",
                "--message-user-foreground": "#FFFFFF",
                "--focus": "#8E9393",
                "--danger": "#A22C36",
                "--success": "#236645",
                "--warning": "#8B5A06"
            },
            "dark": {
                "--background": "#090A0C",
                "--foreground": "#F4F5F7",
                "--surface": "#141619",
                "--surface-subtle": "#202328",
                "--border": "#3A3E45",
                "--muted": "#B8BDC6",
                "--accent": "#E9EFEF",
                "--accent-foreground": "#151B23",
                "--message-user-background": "#444949",
                "--message-user-foreground": "#FFFFFF",
                "--focus": "#E9EFEF",
                "--danger": "#FF9DA3",
                "--success": "#8CE2AA",
                "--warning": "#FFD37D"
            }
        },
        "source": {
            "atlasSha256": "bb06d329ecc9a933c0c3046af4666066e0bdc3f5ba560ac005ccb9a6f662a295",
            "generator": "colors.pydemia.ai · intent-2.0.0",
            "colorsCommit": "ec79fce0ab8bae28b244d5f9fe27baee7fb291a1"
        },
        "reason": "원문이 제시한 무채색 단계값을 그대로 사용합니다. 별도 네온 없이 배경·surface·본문 명도 층으로 구분합니다."
    },
    "minimal": {
        "id": "atlas-minimal",
        "name": "Clear Sky",
        "harmony": "monochromatic",
        "seeds": [
            "#000000",
            "#F6F6F6",
            "#82BEFF"
        ],
        "swatches": {
            "light": [
                "#000000",
                "#F6F6F6",
                "#82BEFF",
                "#DEF7FF",
                "#051220",
                "#74889F"
            ],
            "dark": [
                "#000000",
                "#F6F6F6",
                "#82BEFF",
                "#051220",
                "#DEF7FF",
                "#4C6075"
            ]
        },
        "colors": {
            "light": {
                "--background": "#FFFFFF",
                "--foreground": "#20252D",
                "--surface": "#FFFFFF",
                "--surface-subtle": "#F6F7F8",
                "--border": "#E0E3E7",
                "--muted": "#626A75",
                "--accent": "#3E78B4",
                "--accent-foreground": "#FFFFFF",
                "--message-user-background": "#003969",
                "--message-user-foreground": "#FFFFFF",
                "--focus": "#5C96D5",
                "--danger": "#A22C36",
                "--success": "#236645",
                "--warning": "#8B5A06"
            },
            "dark": {
                "--background": "#14171B",
                "--foreground": "#F1F3F5",
                "--surface": "#191D22",
                "--surface-subtle": "#22272E",
                "--border": "#353B43",
                "--muted": "#B5BBC4",
                "--accent": "#82BEFF",
                "--accent-foreground": "#151B23",
                "--message-user-background": "#074981",
                "--message-user-foreground": "#FFFFFF",
                "--focus": "#82BEFF",
                "--danger": "#FF9AA0",
                "--success": "#8DD9AC",
                "--warning": "#F2C46F"
            }
        },
        "source": {
            "atlasSha256": "bb06d329ecc9a933c0c3046af4666066e0bdc3f5ba560ac005ccb9a6f662a295",
            "generator": "colors.pydemia.ai · intent-2.0.0",
            "colorsCommit": "ec79fce0ab8bae28b244d5f9fe27baee7fb291a1"
        },
        "reason": "이미지 안의 명시 팔레트를 존중해 흑백의 넓은 중성 영역과 작은 파랑 강조만 씁니다."
    },
    "swiss": {
        "id": "atlas-swiss",
        "name": "Ink and Ochre",
        "harmony": "complementary",
        "seeds": [
            "#000000",
            "#F5F5F2",
            "#D6A23A"
        ],
        "swatches": {
            "light": [
                "#000000",
                "#F5F5F2",
                "#D6A23A",
                "#FFEEE8",
                "#0A1506",
                "#7887A0"
            ],
            "dark": [
                "#000000",
                "#F5F5F2",
                "#D6A23A",
                "#051220",
                "#F5F4D4",
                "#505E76"
            ]
        },
        "colors": {
            "light": {
                "--background": "#F7F7F5",
                "--foreground": "#151515",
                "--surface": "#FFFFFF",
                "--surface-subtle": "#EEEEEB",
                "--border": "#C9C9C5",
                "--muted": "#4E4E4A",
                "--accent": "#9A6F00",
                "--accent-foreground": "#FFFFFF",
                "--message-user-background": "#4A3300",
                "--message-user-foreground": "#FFFFFF",
                "--focus": "#BE8B1E",
                "--danger": "#A22C36",
                "--success": "#236645",
                "--warning": "#8B5A06"
            },
            "dark": {
                "--background": "#111111",
                "--foreground": "#F4F4F1",
                "--surface": "#1A1A1A",
                "--surface-subtle": "#252525",
                "--border": "#454545",
                "--muted": "#C1C1BD",
                "--accent": "#D6A23A",
                "--accent-foreground": "#151B23",
                "--message-user-background": "#5E4200",
                "--message-user-foreground": "#FFFFFF",
                "--focus": "#D6A23A",
                "--danger": "#FF9AA0",
                "--success": "#8DD9AC",
                "--warning": "#F2C46F"
            }
        },
        "source": {
            "atlasSha256": "bb06d329ecc9a933c0c3046af4666066e0bdc3f5ba560ac005ccb9a6f662a295",
            "generator": "colors.pydemia.ai · intent-2.0.0",
            "colorsCommit": "ec79fce0ab8bae28b244d5f9fe27baee7fb291a1"
        },
        "reason": "검정 잉크와 종이 대비가 기본입니다. 작은 황토색 신호를 제한적으로 사용해 정렬·타입 위계를 가리지 않습니다."
    },
    "editorial": {
        "id": "atlas-editorial",
        "name": "Paper and Ochre",
        "harmony": "monochromatic",
        "seeds": [
            "#F1F0EA",
            "#24221F",
            "#B48338"
        ],
        "swatches": {
            "light": [
                "#F1F0EA",
                "#24221F",
                "#B48338",
                "#F9F3D3",
                "#131301",
                "#95836A"
            ],
            "dark": [
                "#F1F0EA",
                "#24221F",
                "#B48338",
                "#0D1404",
                "#FFF0D8",
                "#6C5A43"
            ]
        },
        "colors": {
            "light": {
                "--background": "#F6F0E6",
                "--foreground": "#302923",
                "--surface": "#FCFAF6",
                "--surface-subtle": "#EEE7DB",
                "--border": "#D8CBBB",
                "--muted": "#6D6257",
                "--accent": "#996A19",
                "--accent-foreground": "#FFFFFF",
                "--message-user-background": "#4D3200",
                "--message-user-foreground": "#FFFFFF",
                "--focus": "#B48338",
                "--danger": "#A22C36",
                "--success": "#236645",
                "--warning": "#8B5A06"
            },
            "dark": {
                "--background": "#201C19",
                "--foreground": "#F5EEE5",
                "--surface": "#2A2521",
                "--surface-subtle": "#38312B",
                "--border": "#65574B",
                "--muted": "#D0C1B1",
                "--accent": "#B48338",
                "--accent-foreground": "#151B23",
                "--message-user-background": "#624000",
                "--message-user-foreground": "#FFFFFF",
                "--focus": "#B48338",
                "--danger": "#FF9AA0",
                "--success": "#8DD9AC",
                "--warning": "#F2C46F"
            }
        },
        "source": {
            "atlasSha256": "bb06d329ecc9a933c0c3046af4666066e0bdc3f5ba560ac005ccb9a6f662a295",
            "generator": "colors.pydemia.ai · intent-2.0.0",
            "colorsCommit": "ec79fce0ab8bae28b244d5f9fe27baee7fb291a1"
        },
        "reason": "종이·잉크의 낮은 채도와 작은 황토색 표식으로 긴 글의 읽기 리듬을 유지합니다."
    },
    "aurora": {
        "id": "atlas-aurora",
        "name": "Blue Violet Aurora",
        "harmony": "analogous",
        "seeds": [
            "#1673A8",
            "#7641B4",
            "#C244A9"
        ],
        "swatches": {
            "light": [
                "#1673A8",
                "#7641B4",
                "#C244A9",
                "#D8F9FF",
                "#1A0B19",
                "#977D90"
            ],
            "dark": [
                "#1673A8",
                "#7641B4",
                "#C244A9",
                "#0C1021",
                "#FFEBFB",
                "#6D5567"
            ]
        },
        "colors": {
            "light": {
                "--background": "#E8F5FF",
                "--foreground": "#132938",
                "--surface": "#FFFFFF",
                "--surface-subtle": "#DFEEFA",
                "--border": "#BED7EA",
                "--muted": "#4B6374",
                "--accent": "#1673A8",
                "--accent-foreground": "#FFFFFF",
                "--message-user-background": "#003C5C",
                "--message-user-foreground": "#FFFFFF",
                "--focus": "#1673A8",
                "--danger": "#A8324C",
                "--success": "#236645",
                "--warning": "#8B5A06"
            },
            "dark": {
                "--background": "#051A29",
                "--foreground": "#E8F5FF",
                "--surface": "#112736",
                "--surface-subtle": "#1F3544",
                "--border": "#435A6B",
                "--muted": "#ADC7DB",
                "--accent": "#4094CB",
                "--accent-foreground": "#151B23",
                "--message-user-background": "#004D74",
                "--message-user-foreground": "#FFFFFF",
                "--focus": "#1A76AB",
                "--danger": "#FF9EB8",
                "--success": "#8DD9AC",
                "--warning": "#F2C46F"
            }
        },
        "source": {
            "atlasSha256": "bb06d329ecc9a933c0c3046af4666066e0bdc3f5ba560ac005ccb9a6f662a295",
            "generator": "colors.pydemia.ai · intent-2.0.0",
            "colorsCommit": "ec79fce0ab8bae28b244d5f9fe27baee7fb291a1"
        },
        "reason": "청록에서 보라·마젠타로 흐르는 인접 색상을 배경 레이어에 겹치고, 본문은 안정된 어두운 반투명/불투명 면에 둡니다."
    },
    "cyber": {
        "id": "atlas-cyber",
        "name": "Neon Circuit",
        "harmony": "triadic",
        "seeds": [
            "#19D7E7",
            "#F02D7C",
            "#A9E52D"
        ],
        "swatches": {
            "light": [
                "#19D7E7",
                "#F02D7C",
                "#A9E52D",
                "#FEEAFF",
                "#1F0B07",
                "#6C9600"
            ],
            "dark": [
                "#19D7E7",
                "#F02D7C",
                "#A9E52D",
                "#01141F",
                "#E7F4FF",
                "#4A6900"
            ]
        },
        "colors": {
            "light": {
                "--background": "#F3F9FA",
                "--foreground": "#0D3033",
                "--surface": "#FFFFFF",
                "--surface-subtle": "#EBF4F5",
                "--border": "#C5DDDF",
                "--muted": "#436569",
                "--accent": "#00818B",
                "--accent-foreground": "#FFFFFF",
                "--message-user-background": "#004046",
                "--message-user-foreground": "#FFFFFF",
                "--focus": "#00A2AF",
                "--danger": "#A52B3A",
                "--success": "#236645",
                "--warning": "#8B5A06"
            },
            "dark": {
                "--background": "#010F11",
                "--foreground": "#E8F8FA",
                "--surface": "#001D20",
                "--surface-subtle": "#062A2E",
                "--border": "#305256",
                "--muted": "#9EC3C7",
                "--accent": "#19D7E7",
                "--accent-foreground": "#151B23",
                "--message-user-background": "#005259",
                "--message-user-foreground": "#FFFFFF",
                "--focus": "#19D7E7",
                "--danger": "#FF7B91",
                "--success": "#67F2B0",
                "--warning": "#FFD36E"
            }
        },
        "source": {
            "atlasSha256": "bb06d329ecc9a933c0c3046af4666066e0bdc3f5ba560ac005ccb9a6f662a295",
            "generator": "colors.pydemia.ai · intent-2.0.0",
            "colorsCommit": "ec79fce0ab8bae28b244d5f9fe27baee7fb291a1"
        },
        "reason": "암색 바탕 위 청록·마젠타·라임을 상태별 한정 강조로 쓰며 긴 표·로그는 중성 글자색을 우선합니다."
    },
    "terminal": {
        "id": "atlas-terminal",
        "name": "Cyan Green Console",
        "harmony": "analogous",
        "seeds": [
            "#00C8C8",
            "#32C55B",
            "#A8ABB0"
        ],
        "swatches": {
            "light": [
                "#00C8C8",
                "#32C55B",
                "#A8ABB0",
                "#D9FBEB",
                "#001612",
                "#7887A0"
            ],
            "dark": [
                "#00C8C8",
                "#32C55B",
                "#A8ABB0",
                "#00151D",
                "#D5FCF2",
                "#505E76"
            ]
        },
        "colors": {
            "light": {
                "--background": "#F3F8F8",
                "--foreground": "#173030",
                "--surface": "#FFFFFF",
                "--surface-subtle": "#EBF4F4",
                "--border": "#C4DBDA",
                "--muted": "#436464",
                "--accent": "#008282",
                "--accent-foreground": "#FFFFFF",
                "--message-user-background": "#004141",
                "--message-user-foreground": "#FFFFFF",
                "--focus": "#00A4A4",
                "--danger": "#A33438",
                "--success": "#236645",
                "--warning": "#8B5A06"
            },
            "dark": {
                "--background": "#051212",
                "--foreground": "#C9EFEE",
                "--surface": "#061C1C",
                "--surface-subtle": "#032727",
                "--border": "#305252",
                "--muted": "#8FB4B3",
                "--accent": "#00C8C8",
                "--accent-foreground": "#151B23",
                "--message-user-background": "#005353",
                "--message-user-foreground": "#FFFFFF",
                "--focus": "#00C8C8",
                "--danger": "#FF8F88",
                "--success": "#8FF2A8",
                "--warning": "#F6D16D"
            }
        },
        "source": {
            "atlasSha256": "bb06d329ecc9a933c0c3046af4666066e0bdc3f5ba560ac005ccb9a6f662a295",
            "generator": "colors.pydemia.ai · intent-2.0.0",
            "colorsCommit": "ec79fce0ab8bae28b244d5f9fe27baee7fb291a1"
        },
        "reason": "검정 콘솔 바탕에 녹색·청록 상태 문자를 연결하고, 보조 텍스트는 낮은 채도의 회색으로 두어 열 정렬과 판독성을 지킵니다."
    },
    "retro": {
        "id": "atlas-retro",
        "name": "Classic Desktop",
        "harmony": "complementary",
        "seeds": [
            "#008080",
            "#000080",
            "#C0C0C0"
        ],
        "swatches": {
            "light": [
                "#008080",
                "#000080",
                "#C0C0C0",
                "#FFEDED",
                "#130E1F",
                "#9D7E73"
            ],
            "dark": [
                "#008080",
                "#000080",
                "#C0C0C0",
                "#00151D",
                "#EBF2FF",
                "#73564C"
            ]
        },
        "colors": {
            "light": {
                "--background": "#BFC3C8",
                "--foreground": "#171B24",
                "--surface": "#D8DADD",
                "--surface-subtle": "#C8CBD0",
                "--border": "#6F747C",
                "--muted": "#444B56",
                "--accent": "#006969",
                "--accent-foreground": "#FFFFFF",
                "--message-user-background": "#004141",
                "--message-user-foreground": "#FFFFFF",
                "--focus": "#008080",
                "--danger": "#A52B3A",
                "--success": "#236645",
                "--warning": "#714905"
            },
            "dark": {
                "--background": "#222831",
                "--foreground": "#F2F4F8",
                "--surface": "#303943",
                "--surface-subtle": "#3D4854",
                "--border": "#687583",
                "--muted": "#C0C9D4",
                "--accent": "#4CB0B0",
                "--accent-foreground": "#151B23",
                "--message-user-background": "#005353",
                "--message-user-foreground": "#FFFFFF",
                "--focus": "#269191",
                "--danger": "#FF9B9F",
                "--success": "#8DD9AC",
                "--warning": "#F2C46F"
            }
        },
        "source": {
            "atlasSha256": "bb06d329ecc9a933c0c3046af4666066e0bdc3f5ba560ac005ccb9a6f662a295",
            "generator": "colors.pydemia.ai · intent-2.0.0",
            "colorsCommit": "ec79fce0ab8bae28b244d5f9fe27baee7fb291a1"
        },
        "reason": "청록 바탕·남색 제목 표시줄·회색 창틀의 고전 OS 팔레트를 유지하고, 상태색은 시스템 색 역할에 따릅니다."
    },
    "pixel": {
        "id": "atlas-pixel",
        "name": "Arcade Violet",
        "harmony": "triadic",
        "seeds": [
            "#57489B",
            "#26B9D8",
            "#F28B13"
        ],
        "swatches": {
            "light": [
                "#57489B",
                "#26B9D8",
                "#F28B13",
                "#FFEEE5",
                "#041320",
                "#C36D00"
            ],
            "dark": [
                "#57489B",
                "#26B9D8",
                "#F28B13",
                "#180C1B",
                "#FFF3BD",
                "#8A4C00"
            ]
        },
        "colors": {
            "light": {
                "--background": "#EFEEFF",
                "--foreground": "#262339",
                "--surface": "#FCFCFF",
                "--surface-subtle": "#E0DEF5",
                "--border": "#49475F",
                "--muted": "#59576F",
                "--accent": "#57489B",
                "--accent-foreground": "#FFFFFF",
                "--message-user-background": "#382871",
                "--message-user-foreground": "#FFFFFF",
                "--focus": "#57489B",
                "--danger": "#A8324C",
                "--success": "#236645",
                "--warning": "#8B5A06"
            },
            "dark": {
                "--background": "#1A182A",
                "--foreground": "#F3F2FF",
                "--surface": "#26243A",
                "--surface-subtle": "#343249",
                "--border": "#696781",
                "--muted": "#BEBCD9",
                "--accent": "#9084DD",
                "--accent-foreground": "#151B23",
                "--message-user-background": "#473983",
                "--message-user-foreground": "#FFFFFF",
                "--focus": "#7365BB",
                "--danger": "#FF9EB8",
                "--success": "#8DD9AC",
                "--warning": "#F2C46F"
            }
        },
        "source": {
            "atlasSha256": "bb06d329ecc9a933c0c3046af4666066e0bdc3f5ba560ac005ccb9a6f662a295",
            "generator": "colors.pydemia.ai · intent-2.0.0",
            "colorsCommit": "ec79fce0ab8bae28b244d5f9fe27baee7fb291a1"
        },
        "reason": "보라·청록·주황의 제한 팔레트를 정수 배율 픽셀 자산과 실제 진행/보상 표시에 사용하고, 본문은 읽기 쉬운 일반 글꼴로 둡니다."
    },
    "drawn": {
        "id": "atlas-drawn",
        "name": "Paper and Red Pencil",
        "harmony": "complementary",
        "seeds": [
            "#F7F3E8",
            "#24211E",
            "#F04F55"
        ],
        "swatches": {
            "light": [
                "#F7F3E8",
                "#24211E",
                "#F04F55",
                "#EDF2FF",
                "#161101",
                "#688E91"
            ],
            "dark": [
                "#F7F3E8",
                "#24211E",
                "#F04F55",
                "#101403",
                "#FFEFDF",
                "#406568"
            ]
        },
        "colors": {
            "light": {
                "--background": "#FAF6E9",
                "--foreground": "#302B20",
                "--surface": "#FFFDF6",
                "--surface-subtle": "#F1EAD8",
                "--border": "#75664D",
                "--muted": "#655B49",
                "--accent": "#B85453",
                "--accent-foreground": "#FFFFFF",
                "--message-user-background": "#681119",
                "--message-user-foreground": "#FFFFFF",
                "--focus": "#F04F55",
                "--danger": "#A33438",
                "--success": "#236645",
                "--warning": "#8B5A06"
            },
            "dark": {
                "--background": "#211F19",
                "--foreground": "#F4EEDF",
                "--surface": "#2C2A22",
                "--surface-subtle": "#3B372B",
                "--border": "#72694F",
                "--muted": "#CEC3A9",
                "--accent": "#DA7270",
                "--accent-foreground": "#151B23",
                "--message-user-background": "#7C2528",
                "--message-user-foreground": "#FFFFFF",
                "--focus": "#F04F55",
                "--danger": "#FF9DA0",
                "--success": "#8DD9AC",
                "--warning": "#F2C46F"
            }
        },
        "source": {
            "atlasSha256": "bb06d329ecc9a933c0c3046af4666066e0bdc3f5ba560ac005ccb9a6f662a295",
            "generator": "colors.pydemia.ai · intent-2.0.0",
            "colorsCommit": "ec79fce0ab8bae28b244d5f9fe27baee7fb291a1"
        },
        "reason": "종이와 잉크를 기본으로 하고 붉은 연필색은 낙서형 표시·주요 강조에 소량 배치합니다. 입력면과 클릭 영역은 정돈합니다."
    },
    "spatial": {
        "id": "atlas-spatial",
        "name": "Ambient Teal",
        "harmony": "splitComplementary",
        "seeds": [
            "#075B72",
            "#159EBD",
            "#9D6A6A"
        ],
        "swatches": {
            "light": [
                "#075B72",
                "#159EBD",
                "#9D6A6A",
                "#FFEDEE",
                "#051320",
                "#9E7C7C"
            ],
            "dark": [
                "#075B72",
                "#159EBD",
                "#9D6A6A",
                "#061221",
                "#FFEFDE",
                "#745454"
            ]
        },
        "colors": {
            "light": {
                "--background": "#E7F3F8",
                "--foreground": "#102E38",
                "--surface": "#FAFDFE",
                "--surface-subtle": "#D8EBF2",
                "--border": "#B2CDD8",
                "--muted": "#4B6A75",
                "--accent": "#075B72",
                "--accent-foreground": "#FFFFFF",
                "--message-user-background": "#003F50",
                "--message-user-foreground": "#FFFFFF",
                "--focus": "#075B72",
                "--danger": "#A52B3A",
                "--success": "#236645",
                "--warning": "#8B5A06"
            },
            "dark": {
                "--background": "#051E27",
                "--foreground": "#E9F7FC",
                "--surface": "#0F2D37",
                "--surface-subtle": "#1E3B46",
                "--border": "#4A6874",
                "--muted": "#ADCBD7",
                "--accent": "#549AB3",
                "--accent-foreground": "#151B23",
                "--message-user-background": "#005065",
                "--message-user-foreground": "#FFFFFF",
                "--focus": "#347C94",
                "--danger": "#FF9B9F",
                "--success": "#8DD9AC",
                "--warning": "#F2C46F"
            }
        },
        "source": {
            "atlasSha256": "bb06d329ecc9a933c0c3046af4666066e0bdc3f5ba560ac005ccb9a6f662a295",
            "generator": "colors.pydemia.ai · intent-2.0.0",
            "colorsCommit": "ec79fce0ab8bae28b244d5f9fe27baee7fb291a1"
        },
        "reason": "청록·시안의 공간 깊이에 따뜻한 나무/실내 조명을 보조색으로 더합니다. 패널의 계층은 명도·그림자에서 오게 하고 텍스트 대비는 표면 위에서 고정합니다."
    }
};
