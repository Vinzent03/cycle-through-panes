// main.ts

import { Platform, Plugin, WorkspaceLeaf } from "obsidian";
import { GeneralModal } from "./modal";
import CTPSettingTab from "./settingsTab";
import { DEFAULT_SETTINGS, NEW_USER_SETTINGS, Settings } from "./types";

// verbosity setting
const VERBOSE = true;

export default class CycleThroughPanes extends Plugin {
    settings: Settings;
    ctrlPressedTimestamp = 0;
    ctrlKeyCode: string | undefined;
    queuedFocusLeaf: WorkspaceLeaf | undefined;
    leafIndex = 0;
    modal: GeneralModal | undefined;
    leaves: WorkspaceLeaf[] | null = null;

    // New variables for tab history
    tabHistory: string[] = [];
    tabHistoryPerWorkspace: { [workspaceId: string]: string[] } = {};

    keyDownFunc = this.onKeyDown.bind(this);
    keyUpFunc = this.onKeyUp.bind(this);

    getLeavesOfTypes(types: string[]): WorkspaceLeaf[] {
        const leaves: WorkspaceLeaf[] = [];
        const activeLeaf = this.app.workspace.activeLeaf;
        this.app.workspace.iterateAllLeaves((leaf) => {
            if (this.settings.skipPinned && leaf.getViewState().pinned) return;

            const correctViewType =
                !this.settings.useViewTypes ||
                types.contains(leaf.view.getViewType());

            if (!correctViewType) return;

            const isMainWindow = leaf.view.containerEl.win == window;
            const sameWindow = leaf.view.containerEl.win == activeWindow;

            let correctPane = false;
            if (isMainWindow) {
                if (this.settings.stayInSplit) {
                    correctPane =
                        sameWindow && leaf.getRoot() == activeLeaf.getRoot();
                } else {
                    correctPane =
                        sameWindow &&
                        leaf.getRoot() == this.app.workspace.rootSplit;
                }
            } else {
                correctPane = sameWindow;
            }
            if (correctPane) {
                leaves.push(leaf);
            }
        });

        return leaves;
    }

    async onload() {
        if (VERBOSE) {
            console.log("Loading plugin: Cycle through panes");
        }
        
        await this.loadSettings();

        this.addSettingTab(new CTPSettingTab(this, this.settings));

        // Initialize tab history per workspace after the layout is ready
        this.app.workspace.onLayoutReady(() => {
            const workspaceId = this.getWorkspaceId();
            this.tabHistory = this.tabHistoryPerWorkspace[workspaceId] || [];

            // Debug log
            if (VERBOSE) {
                console.log("Loaded tabHistory for workspace:", workspaceId, this.tabHistory);
            }
        });

        // Add commands
        this.addCommand({
            id: "cycle-through-panes",
            name: "Go to right tab",
            checkCallback: (checking: boolean) => {
                const active = this.app.workspace.activeLeaf;

                if (active) {
                    if (!checking) {
                        const leaves: WorkspaceLeaf[] = this.getLeavesOfTypes(
                            this.settings.viewTypes
                        );
                        const index = leaves.indexOf(active);

                        if (index === leaves.length - 1) {
                            this.queueFocusLeaf(leaves[0]);
                        } else {
                            this.queueFocusLeaf(leaves[index + 1]);
                        }
                    }
                    return true;
                }
                return false;
            },
        });

        this.addCommand({
            id: "cycle-through-panes-reverse",
            name: "Go to left tab",
            checkCallback: (checking: boolean) => {
                const active = this.app.workspace.activeLeaf;
                if (active) {
                    if (!checking) {
                        const leaves: WorkspaceLeaf[] = this.getLeavesOfTypes(
                            this.settings.viewTypes
                        );
                        const index = leaves.indexOf(active);

                        if (VERBOSE) {
                            console.log("index of active leaf", index);
                        }

                        if (index !== undefined) {
                            if (index === 0) {
                                this.queueFocusLeaf(leaves[leaves.length - 1]);
                            } else {
                                this.queueFocusLeaf(leaves[index - 1]);
                            }
                        }
                    }
                    return true;
                }
                return false;
            },
        });

        this.addCommand({
            id: "cycle-through-panes-add-view",
            name: "Enable this View Type",
            checkCallback: (checking: boolean) => {
                const active = this.app.workspace.activeLeaf;
                if (
                    active &&
                    !this.settings.viewTypes.contains(active.view.getViewType())
                ) {
                    if (!checking) {
                        this.settings.viewTypes.push(active.view.getViewType());
                        this.saveSettings();
                    }
                    return true;
                }
                return false;
            },
        });

        this.addCommand({
            id: "cycle-through-panes-remove-view",
            name: "Disable this View Type",
            checkCallback: (checking: boolean) => {
                const active = this.app.workspace.activeLeaf;
                if (
                    active &&
                    this.settings.viewTypes.contains(active.view.getViewType())
                ) {
                    if (!checking) {
                        this.settings.viewTypes.remove(
                            active.view.getViewType()
                        );
                        this.saveSettings();
                    }
                    return true;
                }
                return false;
            },
        });

        this.addCommand({
            id: "focus-left-sidebar",
            name: "Focus on left sidebar",
            callback: () => {
                this.app.workspace.leftSplit.expand();
                let leaf: WorkspaceLeaf | undefined;
                this.app.workspace.iterateAllLeaves((e) => {
                    if (e.getRoot() == this.app.workspace.leftSplit) {
                        if (e.activeTime > (leaf?.activeTime || 0)) {
                            leaf = e;
                        }
                    }
                });
                if (leaf) this.queueFocusLeaf(leaf);
            },
        });

        this.addCommand({
            id: "focus-right-sidebar",
            name: "Focus on right sidebar",
            callback: () => {
                this.app.workspace.rightSplit.expand();
                let leaf: WorkspaceLeaf | undefined;
                this.app.workspace.iterateAllLeaves((e) => {
                    if (e.getRoot() == this.app.workspace.rightSplit) {
                        if (e.activeTime > (leaf?.activeTime || 0)) {
                            leaf = e;
                        }
                    }
                });
                if (leaf) this.queueFocusLeaf(leaf);
            },
        });

        this.addCommand({
            id: "focus-on-last-active-pane",
            name: "Go to previous tab",
            callback: async () => {
                this.setLeaves();

                this.leafIndex = (this.leafIndex + 1) % this.leaves.length;
                const leaf = this.leaves[this.leafIndex];

                if (leaf) {
                    this.queueFocusLeaf(leaf);
                }
            },
        });

        this.addCommand({
            id: "focus-on-last-active-pane-reverse",
            name: "Go to next tab",
            callback: async () => {
                this.setLeaves();
                this.leafIndex =
                    (this.leafIndex - 1 + this.leaves.length) %
                    this.leaves.length;
                const leaf = this.leaves[this.leafIndex];

                if (leaf) {
                    this.queueFocusLeaf(leaf);
                }
            },
        });

        // Add event listeners
        this.registerEvent(
            this.app.workspace.on('active-leaf-change', this.onActiveLeafChange.bind(this))
        );
        this.registerEvent(
            this.app.workspace.on('layout-change', this.onLayoutChange.bind(this))
        );

        window.addEventListener("keydown", this.keyDownFunc);
        window.addEventListener("keyup", this.keyUpFunc);
    }

    queueFocusLeaf(leaf: WorkspaceLeaf) {
        if (this.settings.focusLeafOnKeyUp) {
            this.queuedFocusLeaf = leaf;
        } else {
            this.focusLeaf(leaf);
        }
    }

    focusLeaf(leaf: WorkspaceLeaf) {
        if (leaf) {
            const root = leaf.getRoot();
            if (root != this.app.workspace.rootSplit && Platform.isMobile) {
                root.openLeaf(leaf);
                leaf.activeTime = Date.now();
            } else {
                this.app.workspace.setActiveLeaf(leaf, { focus: true });
            }
            if (leaf.getViewState().type == "search") {
                const search = leaf.view.containerEl.querySelector(
                    ".search-input-container input"
                ) as HTMLElement;

                search?.focus();
            }
        }
    }

    setLeaves() {
        if (!this.leaves) {

            if (VERBOSE) {
                console.log("Setting leaves based on tab history because leaves is null");
            }

            const leaves = this.getLeavesOfTypes(this.settings.viewTypes);
            const filePathToLeaf = new Map<string, WorkspaceLeaf>();

            // show the file object of the 0th leaf
            if (VERBOSE) {
                console.log("Leaf Name of 0th leaf:", leaves[0].view.getDisplayText());
                console.log("There are total", leaves.length, "leaves");
            }

            for (const leaf of leaves) {
                const file = leaf.view.getDisplayText();
                if (file) {
                    filePathToLeaf.set(file, leaf);
                }
            }
            this.leaves = []; // this will be an array of WorkspaceLeaf objects
            for (const path of this.tabHistory) { // this.tabHistory is an array of strings representing the file paths of the tabs
                const leaf = filePathToLeaf.get(path); // 
                if (leaf) {
                    this.leaves.push(leaf); // this will be an array of WorkspaceLeaf objects, in python this would be like leaves.append(leaf)
                }
            }
            // Add any leaves not in tabHistory to the end
            for (const leaf of leaves) {
                if (!this.leaves.contains(leaf)) {
                    this.leaves.push(leaf);
                }
            }
            this.leafIndex = this.leaves.indexOf(this.app.workspace.activeLeaf);

            // Debug log
            if (VERBOSE) {
                console.log("Set leaves based on tab history:", this.leaves);
            }
        }
    }

    onActiveLeafChange(leaf: WorkspaceLeaf) {
        const file = leaf.view.getDisplayText();
        if (file) {
            // Remove the file path if it exists in the history
            const index = this.tabHistory.indexOf(file);
            if (index !== -1) {
                this.tabHistory.splice(index, 1);
            }
            // Add the file path to the start of the history
            this.tabHistory.unshift(file);
            // Keep the history to a reasonable length
            if (this.tabHistory.length > 100) {
                this.tabHistory.pop();
            }
            // Save the tab history in the settings
            const workspaceId = this.getWorkspaceId();
            this.tabHistoryPerWorkspace[workspaceId] = this.tabHistory;

            // Debug log
            if (VERBOSE) {
                console.log("Updated tabHistory for workspace:", workspaceId, this.tabHistory);
            }

            this.settings.tabHistoryPerWorkspace = this.tabHistoryPerWorkspace;
            this.saveSettings();

            // Clear leaves so they are reloaded with new history
            this.leaves = null;
        }
    }

    onLayoutChange() {
        const workspaceId = this.getWorkspaceId();
        this.tabHistory = this.tabHistoryPerWorkspace[workspaceId] || []; // this will basically restore the tab history for the workspace

        // Debug log
        if (VERBOSE) {
            console.log("Layout changed. Loaded tabHistory for workspace:", workspaceId, this.tabHistory);
        }

        // Rebuild leaves based on the restored tab history
        this.leaves = null;
        this.setLeaves();
    }

    getWorkspaceId(): string {
        const workspacesPlugin = this.app.internalPlugins.plugins['workspaces'];
        if (workspacesPlugin && workspacesPlugin.enabled) {
            const activeWorkspace = workspacesPlugin.instance.activeWorkspace;
            if (activeWorkspace) {
                // Debug log
                if (VERBOSE) {
                    console.log("Current workspaceId (from workspace name):", activeWorkspace);
                }
                return activeWorkspace;
            } else {
                console.warn("No active workspace found, using default workspaceId.");
                return "default";
            }
        } else {
            console.warn("Workspaces plugin is not enabled, using default workspaceId.");
            return "default";
        }
    }

    onKeyDown(e: KeyboardEvent) {
        if (e.key == "Control") {
            this.ctrlPressedTimestamp = e.timeStamp;
            this.ctrlKeyCode = e.code;

            // Clean slate -- prevent ctrl keystroke from accidentally switching to another tab
            this.queuedFocusLeaf = undefined;
        }
    }

    onKeyUp(e: KeyboardEvent) {
        if (e.code == this.ctrlKeyCode && this.ctrlPressedTimestamp) {
            this.ctrlPressedTimestamp = 0;
            this.leaves = null;

            this.modal?.close();

            if (this.queuedFocusLeaf) {
                this.focusLeaf(this.queuedFocusLeaf);
            }

            this.modal = undefined;
        }

        if (
            e.code == "Tab" &&
            this.ctrlPressedTimestamp &&
            this.settings.showModal &&
            !this.modal &&
            this.leaves
        ) {
            this.modal = new GeneralModal(this.leaves, this);
            this.modal.open();
        }
    }

    onunload() {
        if (VERBOSE) {
            console.log("Unloading plugin: Cycle through panes");
        }
        window.removeEventListener("keydown", this.keyDownFunc);
        window.removeEventListener("keyup", this.keyUpFunc);
    }

    async loadSettings() {
        // Load data from .obsidian/plugins/cycle-through-panes/data.json
        const userSettings = await this.loadData(); // here, this is the settings object which is a JSON object. Obsidian has a built-in function to load data from a file.

        if (VERBOSE) {
            console.log('Before Object.assign: userSettings:', userSettings);
        }

        this.settings = Object.assign(
            {},
            DEFAULT_SETTINGS,
            userSettings ? userSettings : NEW_USER_SETTINGS
        );

        console.log('After Object.assign: this.settings:', this.settings);

        // Initialize tabHistoryPerWorkspace
        this.tabHistoryPerWorkspace = this.settings.tabHistoryPerWorkspace || {}; // here `this` refers to the plugin object. The `settings` object is a property of the plugin object, and the `tabHistoryPerWorkspace` is a property of the `settings` object.

        if (VERBOSE) {
            console.log('Final this.tabHistoryPerWorkspace:', this.tabHistoryPerWorkspace);
        }
        
    }

    async saveSettings() {
        this.settings.tabHistoryPerWorkspace = this.tabHistoryPerWorkspace;
        await this.saveData(this.settings);
    }
}
