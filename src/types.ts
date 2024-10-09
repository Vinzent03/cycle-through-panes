export interface Settings {
    skipPinned: boolean;
    useViewTypes: boolean;
    viewTypes: string[];
    focusLeafOnKeyUp: boolean;
    showModal: boolean;
    stayInSplit: boolean;
    tabHistoryPerWorkspace: { [workspaceId: string]: string[] };
}

export const DEFAULT_SETTINGS: Settings = {
    skipPinned: true,
    useViewTypes: false,
    viewTypes: [],
    focusLeafOnKeyUp: false,
    showModal: false,
    stayInSplit: false,
    tabHistoryPerWorkspace: {},
};

export const NEW_USER_SETTINGS: Settings = {
    skipPinned: false,
    useViewTypes: false,
    viewTypes: [],
    focusLeafOnKeyUp: true,
    showModal: false,
    stayInSplit: false,
    tabHistoryPerWorkspace: {},
};

declare module "obsidian" {
    interface App {
        hotkeyManager: {
            bakedIds: string[];
            bakedHotkeys: { modifiers: string; key: string }[];
        };
    }

    interface WorkspaceLeaf {
        activeTime: number;
    }

    interface WorkspaceItem {
        openLeaf(leaf: WorkspaceLeaf): void;
    }

    interface Modal {
        chooser: {
            moveDown: any;
            moveUp: any;
            selectedItem: number;
            setSelectedItem: (index: number) => void;
        };
        dimBackground: boolean;
    }
}
