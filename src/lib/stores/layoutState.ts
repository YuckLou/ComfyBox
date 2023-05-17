import { get, writable } from 'svelte/store';
import type { Writable } from 'svelte/store';
import type ComfyApp from "$lib/components/ComfyApp"
import { type LGraphNode, type IWidget, type LGraph, NodeMode, type LGraphRemoveNodeOptions, type LGraphAddNodeOptions, type UUID, type NodeID, LiteGraph, type GraphIDMapping } from "@litegraph-ts/core"
import { SHADOW_PLACEHOLDER_ITEM_ID } from 'svelte-dnd-action';
import type { ComfyNodeID } from '$lib/api';
import { v4 as uuidv4 } from "uuid";
import type { ComfyWidgetNode } from '$lib/nodes/widgets';

function isComfyWidgetNode(node: LGraphNode): node is ComfyWidgetNode {
    return "svelteComponentType" in node
}

type DragItemEntry = {
    /*
     * Drag item.
     */
    dragItem: IDragItem,

    /*
     * Children of this drag item.
     * Only applies if the drag item's type is "container"
     */
    children: IDragItem[] | null,

    /*
     * Parent of this drag item.
     */
    parent: IDragItem | null
}

/*
 * Global workflow attributes
 */
export type LayoutAttributes = {
    /*
     * Name of the "Queue Prompt" button. Set to blank to hide the button.
     */
    queuePromptButtonName: string,

    /*
     * If true, clicking the "Queue Prompt" button will run the default subgraph.
     * Set this to false if you need special behavior before running any subgraphs.
     */
    queuePromptButtonRunWorkflow: boolean,
}

/*
 * Keeps track of the tree of UI components - widgets and the containers that
 * group them together.
 */
export type LayoutState = {
    /*
     * Root of the UI tree
     */
    root: IDragItem | null,

    /*
     * All items indexed by their own ID
     */
    allItems: Record<DragItemID, DragItemEntry>,

    /*
     * Items indexed by the litegraph node they're bound to
     * Only contains drag items of type "widget"
     */
    allItemsByNode: Record<ComfyNodeID, DragItemEntry>,

    /*
     * If true, a saved workflow is being deserialized, so ignore any
     * nodeAdded/nodeRemoved events.
     *
     * TODO: instead use LGraphAddNodeOptions.addedBy
     */
    isConfiguring: boolean,

    /*
     * If true, the right-click context menu is open
     */
    isMenuOpen: boolean,

    /*
     * Global workflow attributes
     */
    attrs: LayoutAttributes

    refreshPropsPanel: Writable<number>
}

/**
 * Attributes for both containers and nodes.
 **/
export type Attributes = {
    /*
     * Flex direction for containers.
     */
    direction: "horizontal" | "vertical",

    /*
     * Display name of this item.
     */
    title: string,

    /*
     * List of classes to apply to the component.
     */
    classes: string,

    /*
     * Variant for containers. "hidden" hides margin/borders.
     */
    containerVariant?: "block" | "hidden",

    /*
     * Tags for hiding containers with
     * For WidgetLayouts this will be ignored, it will use node.properties.tags instead
     */
    tags: string[],

    /*
     * If true, don't show this component in the UI
     */
    hidden?: boolean,

    /*
     * If true, grey out this component in the UI
     */
    disabled?: boolean,

    /*
     * CSS styles
     */
    style?: string,

    /**
     * Display variant for widgets/containers (e.g. number widget can act as slider/knob/dial)
     * Valid values depend on the widget in question.
     */
    variant?: string,

    /*
     * What state to set this widget to in the frontend if its corresponding
     * node is disabled in the graph.
     */
    nodeDisabledState: "visible" | "disabled" | "hidden",

    /*********************************************/
    /* Special attributes for widgets/containers */
    /*********************************************/

    // Accordion
    openOnStartup?: boolean

    // Button
    buttonVariant?: "primary" | "secondary",
    buttonSize?: "large" | "small"
}

/*
 * Defines something that can be edited in the properties side panel.
 */
export type AttributesSpec = {
    /*
     * ID necessary for svelte's keyed each, autoset at the top level in this source file.
     */
    id?: number,

    /*
     * Attribute name. Corresponds to the name of the instance variable in the
     * hashmap/class instance, which depends on `location`.
     */
    name: string,

    /*
     * Type of this attribute.
     * If you want to support a custom type, use "string" combined with
     * `serialize` and `deserialize`.
     */
    type: "string" | "enum" | "number" | "boolean",

    /*
     * Location of this attribute.
     * - "widget":    inside IDragNode.attrs
     * - "nodeProps": inside LGraphNode.properties
     * - "nodeVars":  an instance variable directly on an LGraphNode
     * - "workflow":  inside $layoutState.attrs
     */
    location: "widget" | "nodeProps" | "nodeVars" | "workflow"

    /*
     * Can this attribute be edited in the properties pane?
     */
    editable: boolean,

    /*
     * Default value to supply to this attribute if it is null when the properties pane is opened.
     * NOTE: This means that any attribute can't have a default null value!
     */
    defaultValue: any,

    /*
     * If `type` is "enum", the valid values for the combo widget.
     */
    values?: string[],

    /*
     * If `type` is "number", step for the slider
     */
    step?: number,

    /*
     * If `type` is "number", min for the slider
     */
    min?: number,

    /*
     * If `type` is "number", max for the slider
     */
    max?: number,

    /*
     * If `type` is "string", display as a textarea.
     */
    multiline?: boolean,

    /*
     * Valid `LGraphNode.type`s this property applies to if it's located in a node.
     * These are like "ui/button", "ui/slider".
     */
    validNodeTypes?: string[],

    /*
     * Callback: if false, don't show the property in the pane.
     * Useful if you need to show the property based on another property.
     * Example: If the IDragItem is a container (not a widget), show its flex `direction`.
     */
    canShow?: (arg: IDragItem | LGraphNode) => boolean,

    /*
     * If the type of this spec is "string", but the underlying type is something else,
     * convert the value to a string here so it can be edited in the textbox.
     */
    serialize?: (arg: any) => string,

    /*
     * If the type of this spec is "string", but the underlying type is something else,
     * convert the textbox value into the underlying value.
     */
    deserialize?: (arg: string) => any,

    /*
     * If true, when this property is changed the properties pane will be rebuilt.
     * This should be used if there's a canShow dependent on this property so
     * the pane can be updated with the new list of valid properties.
     */
    refreshPanelOnChange?: boolean,

    /*
     * Callback run when this value is changed.
     */
    onChanged?: (arg: IDragItem | LGraphNode | LayoutState, value: any, prevValue: any) => void,
}

/*
 * A list of `AttributesSpec`s grouped under a category.
 */
export type AttributesCategorySpec = {
    categoryName: string,
    specs: AttributesSpec[]
}

export type AttributesSpecList = AttributesCategorySpec[]

const serializeStringArray = (arg: string[]) => {
    if (arg == null)
        arg = []
    return arg.join(",")
}
const deserializeStringArray = (arg: string) => {
    if (arg === "" || arg == null)
        return []
    return arg.split(",").map(s => s.trim())
}

const setNodeTitle = (arg: IDragItem, value: any) => {
    if (arg.type !== "widget")
        return

    const widget = arg as WidgetLayout;
    if (widget.node == null)
        return;

    const reg = LiteGraph.registered_node_types[widget.node.type];
    if (reg == null)
        return

    if (value && value !== reg.title)
        widget.node.title = `${reg.title} (${value})`
    else
        widget.node.title = reg.title
}

/*
 * Attributes that will show up in the properties panel.
 * Their order in the list is the order they'll appear in the panel.
 */
const ALL_ATTRIBUTES: AttributesSpecList = [
    {
        categoryName: "appearance",
        specs: [
            {
                name: "title",
                type: "string",
                location: "widget",
                defaultValue: "",
                editable: true,
                onChanged: setNodeTitle
            },
            {
                name: "hidden",
                type: "boolean",
                location: "widget",
                defaultValue: false,
                editable: true
            },
            {
                name: "disabled",
                type: "boolean",
                location: "widget",
                defaultValue: false,
                editable: true
            },
            {
                name: "direction",
                type: "enum",
                location: "widget",
                editable: true,
                values: ["horizontal", "vertical"],
                defaultValue: "vertical",
                canShow: (di: IDragItem) => di.type === "container"
            },
            {
                name: "classes",
                type: "string",
                location: "widget",
                defaultValue: "",
                editable: true,
            },
            {
                name: "style",
                type: "string",
                location: "widget",
                defaultValue: "",
                editable: true
            },
            {
                name: "nodeDisabledState",
                type: "enum",
                location: "widget",
                editable: true,
                values: ["visible", "disabled", "hidden"],
                defaultValue: "hidden",
                canShow: (di: IDragItem) => di.type === "widget"
            },

            // Container variants
            {
                name: "variant",
                type: "enum",
                location: "widget",
                editable: true,
                values: ["block", "accordion", "tabs"],
                defaultValue: "block",
                canShow: (di: IDragItem) => di.type === "container",
                refreshPanelOnChange: true
            },
            {
                name: "containerVariant",
                type: "enum",
                location: "widget",
                editable: true,
                values: ["block", "hidden"],
                defaultValue: "hidden",
                canShow: (di: IDragItem) => di.type === "container"
            },

            // Accordion
            {
                name: "openOnStartup",
                type: "boolean",
                location: "widget",
                editable: true,
                defaultValue: false,
                canShow: (di: IDragItem) => di.type === "container" && di.attrs.variant === "accordion"
            },

            // Button
            {
                name: "buttonVariant",
                type: "enum",
                location: "widget",
                editable: true,
                validNodeTypes: ["ui/button"],
                values: ["primary", "secondary"],
                defaultValue: "primary"
            },
            {
                name: "buttonSize",
                type: "enum",
                location: "widget",
                editable: true,
                validNodeTypes: ["ui/button"],
                values: ["large", "small"],
                defaultValue: "large"
            },

            // Combo
            {
                name: "convertValueToLabelCode",
                type: "string",
                location: "nodeProps",
                editable: true,
                multiline: true,
                validNodeTypes: ["ui/combo"],
                defaultValue: ""
            },

            // Editor
            {
                name: "variant",
                type: "enum",
                location: "widget",
                editable: true,
                validNodeTypes: ["ui/image_editor"],
                values: ["inlineEditor", "fileUpload"],
                defaultValue: "inlineEditor",
                refreshPanelOnChange: true
            },

            // Gallery
            {
                name: "variant",
                type: "enum",
                location: "widget",
                editable: true,
                validNodeTypes: ["ui/gallery"],
                values: ["gallery", "image"],
                defaultValue: "gallery",
                refreshPanelOnChange: true
            },
        ]
    },
    {
        categoryName: "behavior",
        specs: [
            // Node variables
            {
                name: "saveUserState",
                type: "boolean",
                location: "nodeVars",
                editable: true,
                defaultValue: true,
            },
            {
                name: "mode",
                type: "enum",
                location: "nodeVars",
                editable: true,
                values: ["ALWAYS", "NEVER"],
                defaultValue: "ALWAYS",
                serialize: (s) => s === NodeMode.ALWAYS ? "ALWAYS" : "NEVER",
                deserialize: (m) => m === "ALWAYS" ? NodeMode.ALWAYS : NodeMode.NEVER
            },
            {
                name: "horizontal",
                type: "boolean",
                location: "nodeVars",
                editable: true,
                defaultValue: false
            },

            // Node properties
            {
                name: "tags",
                type: "string",
                location: "nodeProps",
                editable: true,
                defaultValue: [],
                serialize: serializeStringArray,
                deserialize: deserializeStringArray
            },

            // Container tags are contained in the widget attributes
            {
                name: "tags",
                type: "string",
                location: "widget",
                editable: true,
                defaultValue: [],
                serialize: serializeStringArray,
                deserialize: deserializeStringArray,
                canShow: (di: IDragItem) => di.type === "container"
            },

            // Range
            {
                name: "min",
                type: "number",
                location: "nodeProps",
                editable: true,
                defaultValue: 0,
                min: -2 ^ 16,
                max: 2 ^ 16,
                validNodeTypes: ["ui/number"],
            },
            {
                name: "max",
                type: "number",
                location: "nodeProps",
                editable: true,
                defaultValue: 10,
                min: -2 ^ 16,
                max: 2 ^ 16,
                validNodeTypes: ["ui/number"],
            },
            {
                name: "step",
                type: "number",
                location: "nodeProps",
                editable: true,
                defaultValue: 1,
                min: -2 ^ 16,
                max: 2 ^ 16,
                validNodeTypes: ["ui/number"],
            },

            // Button
            {
                name: "param",
                type: "string",
                location: "nodeProps",
                editable: true,
                validNodeTypes: ["ui/button"],
                defaultValue: "bang"
            },

            // Gallery
            {
                name: "updateMode",
                type: "enum",
                location: "nodeProps",
                editable: true,
                validNodeTypes: ["ui/gallery"],
                values: ["replace", "append"],
                defaultValue: "replace"
            },

            // Radio
            {
                name: "choices",
                type: "string",
                location: "nodeProps",
                editable: true,
                validNodeTypes: ["ui/radio"],
                defaultValue: ["Choice A", "Choice B", "Choice C"],
                serialize: serializeStringArray,
                deserialize: deserializeStringArray,
            },

            // Workflow
            {
                name: "queuePromptButtonName",
                type: "string",
                location: "workflow",
                editable: true,
                defaultValue: "Queue Prompt"
            },
            {
                name: "queuePromptButtonRunWorkflow",
                type: "boolean",
                location: "workflow",
                editable: true,
                defaultValue: true
            }
        ]
    }
];

// This is needed so the specs can be iterated with svelte's keyed #each.
let i = 0;
for (const cat of Object.values(ALL_ATTRIBUTES)) {
    for (const spec of Object.values(cat.specs)) {
        spec.id = i;
        i += 1;
    }
}

export { ALL_ATTRIBUTES };

// TODO Should be nested by category for name uniqueness?
const defaultWidgetAttributes: Attributes = {} as any
const defaultWorkflowAttributes: LayoutAttributes = {} as any
for (const cat of Object.values(ALL_ATTRIBUTES)) {
    for (const spec of Object.values(cat.specs)) {
        if (spec.defaultValue != null) {
            if (spec.location === "widget") {
                defaultWidgetAttributes[spec.name] = spec.defaultValue;
            }
            else if (spec.location === "workflow") {
                defaultWorkflowAttributes[spec.name] = spec.defaultValue;
            }
        }
    }
}

/*
 * Something that can be dragged around in the frontend - a widget or a container.
 */
export interface IDragItem {
    /*
     * Type of the item.
     */
    type: "container" | "widget",

    /*
     * Unique ID of the item.
     */
    id: DragItemID,

    /*
     * If true, the node associated with this drag item is executing.
     * Used to show an indicator on the widget/container.
     */
    isNodeExecuting?: boolean,

    /*
     * Attributes for this drag item.
     */
    attrs: Attributes,

    /*
     * Hackish thing to indicate to Svelte that an attribute changed.
     * TODO Use Writeable<Attributes> instead!
     */
    attrsChanged: Writable<number>
}

/*
 * A container (block, accordion, tabs). Has child drag items.
 */
export interface ContainerLayout extends IDragItem {
    type: "container",

    // Ephemeral state to preserve when the component gets recreated by Svelte
    // (not serialized)

    // Accordion
    isOpen?: Writable<boolean>,
}

/*
 * A widget (slider, dropdown, textbox...)
 */
export interface WidgetLayout extends IDragItem {
    type: "widget",

    /*
     * litegraph node this widget is bound to.
     */
    node: ComfyWidgetNode
}

export type DragItemID = UUID;

type LayoutStateOps = {
    addContainer: (parent: ContainerLayout | null, attrs: Partial<Attributes>, index?: number) => ContainerLayout,
    addWidget: (parent: ContainerLayout, node: ComfyWidgetNode, attrs: Partial<Attributes>, index?: number) => WidgetLayout,
    findDefaultContainerForInsertion: () => ContainerLayout | null,
    updateChildren: (parent: IDragItem, children: IDragItem[]) => IDragItem[],
    nodeAdded: (node: LGraphNode, options: LGraphAddNodeOptions) => void,
    nodeRemoved: (node: LGraphNode, options: LGraphRemoveNodeOptions) => void,
    groupItems: (dragItemIDs: DragItemID[], attrs?: Partial<Attributes>) => ContainerLayout,
    ungroup: (container: ContainerLayout) => void,
    findLayoutEntryForNode: (nodeId: ComfyNodeID) => DragItemEntry | null,
    findLayoutForNode: (nodeId: ComfyNodeID) => IDragItem | null,
    serialize: () => SerializedLayoutState,
    deserialize: (data: SerializedLayoutState, graph: LGraph) => void,
    initDefaultLayout: () => void,
    onStartConfigure: () => void
}

export type WritableLayoutStateStore = Writable<LayoutState> & LayoutStateOps;
const store: Writable<LayoutState> = writable({
    root: null,
    allItems: {},
    allItemsByNode: {},
    isMenuOpen: false,
    isConfiguring: true,
    refreshPropsPanel: writable(0),
    attrs: {
        ...defaultWorkflowAttributes
    }
})

function clear() {
    store.set({
        root: null,
        allItems: {},
        allItemsByNode: {},
        isMenuOpen: false,
        isConfiguring: true,
        refreshPropsPanel: writable(0),
        attrs: {
            ...defaultWorkflowAttributes
        }
    })
}

function findDefaultContainerForInsertion(): ContainerLayout | null {
    const state = get(store);

    if (state.root === null) {
        // Should never happen
        throw "Root container was null!";
    }

    if (state.root.type === "container") {
        const container = state.root as ContainerLayout;
        const children: IDragItem[] = state.allItems[container.id]?.children || []
        const found = children.find((di) => di.type === "container")
        if (found && found.type === "container")
            return found as ContainerLayout;
        return container;
    }

    return null
}

function runOnChangedForWidgetDefaults(dragItem: IDragItem) {
    for (const cat of Object.values(ALL_ATTRIBUTES)) {
        for (const spec of Object.values(cat.specs)) {
            if (defaultWidgetAttributes[spec.name] !== undefined && spec.onChanged != null) {
                spec.onChanged(dragItem, dragItem.attrs[spec.name], dragItem.attrs[spec.name])
            }
        }
    }
}

function addContainer(parent: ContainerLayout | null, attrs: Partial<Attributes> = {}, index?: number): ContainerLayout {
    const state = get(store);
    const dragItem: ContainerLayout = {
        type: "container",
        id: uuidv4(),
        attrsChanged: writable(0),
        attrs: {
            ...defaultWidgetAttributes,
            title: "Container",
            ...attrs
        }
    }

    const entry: DragItemEntry = { dragItem, children: [], parent: null };

    if (state.allItemsByNode[dragItem.id] != null)
        throw new Error(`Container with ID ${dragItem.id} already registered!!!`)
    state.allItems[dragItem.id] = entry;

    if (parent) {
        moveItem(dragItem, parent, index)
    }

    console.debug("[layoutState] addContainer", state)
    store.set(state)
    runOnChangedForWidgetDefaults(dragItem)
    return dragItem;
}

function addWidget(parent: ContainerLayout, node: ComfyWidgetNode, attrs: Partial<Attributes> = {}, index?: number): WidgetLayout {
    const state = get(store);
    const widgetName = node.title || "Widget"
    const dragItem: WidgetLayout = {
        type: "widget",
        id: uuidv4(),
        node: node,
        attrsChanged: writable(0),
        attrs: {
            ...defaultWidgetAttributes,
            title: widgetName,
            nodeDisabledState: "disabled",
            ...attrs
        }
    }

    const entry: DragItemEntry = { dragItem, children: [], parent: null };

    if (state.allItems[dragItem.id] != null)
        throw new Error(`Widget with ID ${dragItem.id} already registered!!!`)
    state.allItems[dragItem.id] = entry;

    if (state.allItemsByNode[node.id] != null)
        throw new Error(`Widget's node with ID ${node.id} already registered!!!`)
    state.allItemsByNode[node.id] = entry;

    console.debug("[layoutState] addWidget", state)
    moveItem(dragItem, parent, index)
    runOnChangedForWidgetDefaults(dragItem)
    return dragItem;
}

function updateChildren(parent: IDragItem, newChildren?: IDragItem[]): IDragItem[] {
    const state = get(store);
    if (newChildren)
        state.allItems[parent.id].children = newChildren;
    for (const child of state.allItems[parent.id].children) {
        if (child.id === SHADOW_PLACEHOLDER_ITEM_ID)
            continue;
        state.allItems[child.id].parent = parent;
    }
    store.set(state)
    return state.allItems[parent.id].children
}

function removeEntry(state: LayoutState, id: DragItemID) {
    const entry = state.allItems[id]
    if (entry.children && entry.children.length > 0) {
        console.error(entry)
        throw `Tried removing entry ${id} but it still had children!`
    }
    const parent = entry.parent;
    if (parent) {
        const parentEntry = state.allItems[parent.id];
        parentEntry.children = parentEntry.children.filter(item => item.id !== id)
    }
    if (entry.dragItem.type === "widget") {
        const widget = entry.dragItem as WidgetLayout;
        delete state.allItemsByNode[widget.node.id]
    }
    delete state.allItems[id]
}

function nodeAdded(node: LGraphNode, options: LGraphAddNodeOptions) {
    // Only concern ourselves with widget nodes
    if (!isComfyWidgetNode(node))
        return;

    const state = get(store)
    if (state.isConfiguring)
        return;

    let attrs: Partial<Attributes> = {}

    if (options.addedBy === "moveIntoSubgraph" || options.addedBy === "moveOutOfSubgraph") {
        // All we need to do is update the nodeID linked to this node.
        const item = state.allItemsByNode[options.prevNodeID]
        delete state.allItemsByNode[options.prevNodeID]
        state.allItemsByNode[node.id] = item
        return;
    }
    else if ((options.addedBy === "cloneSelection" || options.addedBy === "paste") && options.prevNodeID != null) {
        console.warn("WASCLONED", options.addedBy, options.prevNodeID, Object.keys(state.allItemsByNode), options.prevNode, options.subgraphs)
        // Grab layout state information and clone it too.

        let prevWidget = state.allItemsByNode[node.id]
        if (prevWidget == null) {
            // If a subgraph was cloned, try looking for the original widget node corresponding to the new widget node being added.
            // `node` is the new ComfyWidgetNode instance to copy attrs to.
            // `options.cloneData` should contain the results of Subgraph.clone(), called "subgraphNewIDMapping".
            // `options.cloneData` is attached to the onNodeAdded options if a node is added to a graph after being
            // selection-cloned or pasted, as they both call clone() internally.
            const cloneData = options.cloneData.forNode[options.prevNodeID]
            if (cloneData && cloneData.subgraphNewIDMapping != null) {
                // At this point we know options.prevNodeID points to a subgraph.
                const mapping = cloneData.subgraphNewIDMapping as GraphIDMapping

                // This mapping is two-way, so oldID -> newID *and* newID -> oldID are supported.
                // Take the cloned node's ID and look up what the original node's ID was.
                const nodeIDInLayoutState = mapping.nodeIDs[node.id];

                if (nodeIDInLayoutState) {
                    // Gottem.
                    prevWidget = state.allItemsByNode[nodeIDInLayoutState]
                    console.warn("FOUND CLONED SUBGRAPH NODE", node.id, "=>", nodeIDInLayoutState, prevWidget)
                }
            }
        }

        if (prevWidget) {
            console.warn("FOUND", prevWidget.dragItem.attrs)
            // XXX: Will this work for most properties?
            attrs = structuredClone(prevWidget.dragItem.attrs)
        }
    }

    const parent = findDefaultContainerForInsertion();

    console.debug("[layoutState] nodeAdded", node.id)
    addWidget(parent, node, attrs);
}

function nodeRemoved(node: LGraphNode, options: LGraphRemoveNodeOptions) {
    if (options.removedBy === "moveIntoSubgraph" || options.removedBy === "moveOutOfSubgraph") {
        // This node is being moved into a subgraph, so it will be readded under
        // a new node ID shortly.
        return
    }

    const state = get(store)

    console.debug("[layoutState] nodeRemoved", node)

    let del = Object.entries(state.allItems).filter(pair =>
        pair[1].dragItem.type === "widget"
        && (pair[1].dragItem as WidgetLayout).node.id === node.id)

    for (const pair of del) {
        const [id, dragItem] = pair;
        removeEntry(state, id)
    }

    store.set(state)
}

function moveItem(target: IDragItem, to: ContainerLayout, index?: number) {
    const state = get(store)
    const entry = state.allItems[target.id]
    if (entry.parent && entry.parent.id === to.id)
        return;

    if (entry.parent) {
        const parentEntry = state.allItems[entry.parent.id];
        const parentIndex = parentEntry.children.findIndex(c => c.id === target.id)
        if (parentIndex !== -1) {
            parentEntry.children.splice(parentIndex, 1)
        }
        else {
            console.error(parentEntry)
            console.error(target)
            throw "Child not found in parent!"
        }
    }

    const toEntry = state.allItems[to.id];
    if (index != null && index >= 0)
        toEntry.children.splice(index, 0, target)
    else
        toEntry.children.push(target)
    state.allItems[target.id].parent = toEntry.dragItem;

    console.debug("[layoutState] Move child", target, toEntry, index)

    store.set(state)
}

function groupItems(dragItemIDs: DragItemID[], attrs: Partial<Attributes> = {}): ContainerLayout {
    if (dragItemIDs.length === 0)
        return;

    const state = get(store)
    const parent = state.allItems[dragItemIDs[0]].parent || findDefaultContainerForInsertion();

    if (parent === null || parent.type !== "container")
        return;

    let index = undefined;
    if (parent) {
        const indexFound = state.allItems[parent.id].children.findIndex(c => c.id === dragItemIDs[0])
        if (indexFound !== -1)
            index = indexFound
    }

    const container = addContainer(parent as ContainerLayout, { title: "", containerVariant: "block", ...attrs }, index)

    for (const itemID of dragItemIDs) {
        const item = state.allItems[itemID].dragItem;
        moveItem(item, container)
    }

    console.debug("[layoutState] Grouped", container, parent, state.allItems[container.id].children, index)

    store.set(state)
    return container
}

function ungroup(container: ContainerLayout) {
    const state = get(store)

    const parent = state.allItems[container.id].parent;
    if (!parent || parent.type !== "container") {
        console.warn("No parent to ungroup into!", container)
        return;
    }

    let index = undefined;
    const parentChildren = state.allItems[parent.id].children;
    const indexFound = parentChildren.findIndex(c => c.id === container.id)
    if (indexFound !== -1)
        index = indexFound

    const containerEntry = state.allItems[container.id]
    console.debug("[layoutState] About to ungroup", containerEntry, parent, parentChildren, index)

    const children = [...containerEntry.children]
    for (const item of children) {
        moveItem(item, parent as ContainerLayout, index)
    }

    removeEntry(state, container.id)

    console.debug("[layoutState] Ungrouped", containerEntry, parent, parentChildren, index)

    store.set(state)
}

function findLayoutEntryForNode(nodeId: ComfyNodeID): DragItemEntry | null {
    const state = get(store)
    const found = Object.entries(state.allItems).find(pair =>
        pair[1].dragItem.type === "widget"
        && (pair[1].dragItem as WidgetLayout).node.id === nodeId)
    if (found)
        return found[1]
    return null;
}

function findLayoutForNode(nodeId: ComfyNodeID): WidgetLayout | null {
    const found = findLayoutEntryForNode(nodeId);
    if (!found)
        return null;
    return found.dragItem as WidgetLayout
}

function initDefaultLayout() {
    store.set({
        root: null,
        allItems: {},
        allItemsByNode: {},
        isMenuOpen: false,
        isConfiguring: false,
        refreshPropsPanel: writable(0),
        attrs: {
            ...defaultWorkflowAttributes
        }
    })

    const root = addContainer(null, { direction: "horizontal", title: "" });
    const left = addContainer(root, { direction: "vertical", title: "" });
    const right = addContainer(root, { direction: "vertical", title: "" });

    const state = get(store)
    state.root = root;
    store.set(state)

    console.debug("[layoutState] initDefault", state)
}

export type SerializedLayoutState = {
    root: DragItemID | null,
    allItems: Record<DragItemID, SerializedDragEntry>,
    attrs: LayoutAttributes
}

export type SerializedDragEntry = {
    dragItem: SerializedDragItem,
    children: DragItemID[],
    parent: DragItemID | null
}

export type SerializedDragItem = {
    type: string,
    id: DragItemID,
    nodeId: UUID | null,
    attrs: Attributes
}

function serialize(): SerializedLayoutState {
    const state = get(store)

    const allItems: Record<DragItemID, SerializedDragEntry> = {}
    for (const pair of Object.entries(state.allItems)) {
        const [id, entry] = pair;
        allItems[id] = {
            dragItem: {
                type: entry.dragItem.type,
                id: entry.dragItem.id,
                nodeId: (entry.dragItem as any).node?.id,
                attrs: entry.dragItem.attrs
            },
            children: entry.children.map((di) => di.id),
            parent: entry.parent?.id
        }
    }

    return {
        root: state.root?.id,
        allItems,
        attrs: state.attrs
    }
}

function deserialize(data: SerializedLayoutState, graph: LGraph) {
    const allItems: Record<DragItemID, DragItemEntry> = {}
    const allItemsByNode: Record<number, DragItemEntry> = {}
    for (const pair of Object.entries(data.allItems)) {
        const [id, entry] = pair;

        const dragItem: IDragItem = {
            type: entry.dragItem.type,
            id: entry.dragItem.id,
            attrs: { ...defaultWidgetAttributes, ...entry.dragItem.attrs },
            attrsChanged: writable(0)
        };

        const dragEntry: DragItemEntry = {
            dragItem,
            children: [],
            parent: null
        }

        allItems[id] = dragEntry

        if (dragItem.type === "widget") {
            const widget = dragItem as WidgetLayout;
            widget.node = graph.getNodeByIdRecursive(entry.dragItem.nodeId) as ComfyWidgetNode
            if (widget.node == null)
                throw (`Node in litegraph not found! ${entry.dragItem.nodeId}`)
            allItemsByNode[entry.dragItem.nodeId] = dragEntry
        }
    }

    // reconnect parent/child tree
    for (const pair of Object.entries(data.allItems)) {
        const [id, entry] = pair;

        for (const childId of entry.children) {
            allItems[id].children.push(allItems[childId].dragItem)
        }
        if (entry.parent) {
            allItems[id].parent = allItems[entry.parent].dragItem;
        }
    }

    let root: IDragItem = null;
    if (data.root)
        root = allItems[data.root].dragItem

    const state: LayoutState = {
        root,
        allItems,
        allItemsByNode,
        isMenuOpen: false,
        isConfiguring: false,
        refreshPropsPanel: writable(0),
        attrs: { ...defaultWorkflowAttributes, ...data.attrs }
    }

    console.debug("[layoutState] deserialize", data, state, defaultWorkflowAttributes)

    store.set(state)

    // Ensure properties panel is updated with new state
    state.refreshPropsPanel.set(get(state.refreshPropsPanel) + 1)
}

function onStartConfigure() {
    store.update(s => {
        s.isConfiguring = true;
        return s
    })
}

const layoutStateStore: WritableLayoutStateStore =
{
    ...store,
    addContainer,
    addWidget,
    findDefaultContainerForInsertion,
    updateChildren,
    nodeAdded,
    nodeRemoved,
    groupItems,
    findLayoutEntryForNode,
    findLayoutForNode,
    ungroup,
    initDefaultLayout,
    onStartConfigure,
    serialize,
    deserialize
}
export default layoutStateStore;
