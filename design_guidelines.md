# Momentum Agent Design Guidelines

## Design Approach

**System-Based Approach**: Drawing from Linear's efficiency, Notion's navigation patterns, and modern CRM interfaces (Salesforce Lightning, HubSpot). This is a productivity tool where clarity, speed, and information density drive user success.

**Core Principles**:
- Information density without clutter
- One-click actions prioritized
- Scannable data hierarchy
- Persistent navigation for fast switching
- Minimal friction for common workflows

---

## Layout System

**Spacing Primitives**: Use Tailwind units of **2, 3, 4, 6, 8, 12, 16** for consistency
- Tight spacing: p-2, gap-2 (badges, compact lists)
- Standard spacing: p-4, gap-4 (cards, form fields)
- Generous spacing: p-6, p-8 (sections, containers)
- Major spacing: py-12, py-16 (page sections)

**Grid Structure**:
- Left Sidebar: fixed w-64 (desktop), collapsible to w-16 (icon-only)
- Top Bar: h-16 fixed
- Main Content: flex-1 with max-w-full
- Right Drawer: w-96 slide-in overlay (lead details)

**Kanban Board Layout**:
- Horizontal scroll container with gap-4
- Each column: min-w-80, max-w-96
- Card spacing: gap-3 within columns
- Drag indicators: subtle visual feedback

---

## Typography

**Font Stack**: 
- Primary: Inter or System UI stack
- Monospace: JetBrains Mono (for data/metrics)

**Hierarchy**:
- Page titles: text-2xl font-semibold
- Section headers: text-lg font-semibold
- Card titles: text-base font-medium
- Body text: text-sm
- Metadata/labels: text-xs font-medium uppercase tracking-wide
- Metrics/numbers: text-xl to text-3xl font-bold (monospace)

---

## Component Library

### Navigation
**Left Sidebar**:
- Logo/branding: h-16 header area
- Nav items: h-10 with pl-4, text-sm font-medium, gap-3 for icon+label
- Active state: font-semibold with subtle left border (border-l-2)
- Collapsed state: center-aligned icons only

**Top Bar**:
- Search: max-w-md with icon prefix
- User profile: flex items-center gap-3, avatar (h-8 w-8 rounded-full)
- Quick actions: icon buttons (h-9 w-9)

### Kanban Board
**Column Headers**:
- Sticky positioning (top-0)
- flex justify-between items-center
- Count badge: text-xs px-2 py-1 rounded-full
- Add button: icon-only, subtle

**Lead Cards**:
- Border card with rounded-lg
- Padding: p-4
- Company name: text-base font-semibold mb-2
- Metadata grid: 2-column grid gap-2
- Traffic light badge: h-2 w-2 rounded-full (inline)
- Next date badge: text-xs px-2 py-1 rounded-md
- Hover: subtle elevation increase

### Lead Drawer (Right Panel)
**Structure**:
- Header: sticky top-0, h-16, company name + close button
- Content: overflow-y-auto with p-6
- Sections: space-y-6

**Activity Buttons**:
- Grid: grid-cols-2 gap-2
- Button size: h-12 with icon + label + counter
- Counter: text-xs in circle badge

**Form Fields**:
- Label: text-xs font-medium mb-1
- Input height: h-10
- Spacing between fields: space-y-4

### Dashboard & Analytics
**Stat Cards**:
- Grid: grid-cols-2 lg:grid-cols-4 gap-4
- Card padding: p-6
- Value: text-3xl font-bold (monospace)
- Label: text-sm mt-2
- Change indicator: text-xs with arrow icon

**Charts**:
- Container padding: p-6
- Min height: min-h-80
- Responsive aspect ratio

### Tables & Lists
**Task/Lead Lists**:
- Row height: h-14
- Hover: full-row highlight
- Checkbox: w-4 h-4 mr-3
- Status badges: inline-flex items-center gap-1.5

---

## Key Interactions

**Drag & Drop**:
- Dragging card: slight opacity reduction + elevation
- Drop zone: dashed border indication
- No elaborate animations

**Drawer Transitions**:
- Slide from right: 200ms ease
- Backdrop: subtle overlay

**One-Click Actions**:
- Immediate visual feedback (icon change, counter update)
- Undo toast notification (bottom-right)

**Traffic Light Status**:
- Always visible as small circle (h-2 w-2) next to next contact date
- Green/Amber/Red states clearly distinguished
- Larger badge version (h-3 w-3) for list views

---

## Responsive Strategy

**Desktop (lg+)**: Full three-pane layout (sidebar + main + drawer)
**Tablet (md)**: Collapsible sidebar, drawer overlays main
**Mobile (base)**: 
- Bottom navigation bar
- Full-screen views
- Kanban: vertical stack instead of horizontal scroll
- Drawer: full-screen modal

---

## Accessibility

- Focus states: visible ring (ring-2)
- Keyboard navigation: full support for drawer, forms, Kanban
- ARIA labels: all icon buttons, status indicators
- Touch targets: minimum h-10 w-10
- Consistent heading hierarchy (h1 → h2 → h3)

---

## AI Agent Panel

**Overlay Style**: 
- Bottom-right floating panel: w-96, max-h-96
- Toggle button: fixed bottom-6 right-6, h-14 w-14 rounded-full
- Panel: rounded-t-xl, shadow-2xl
- Messages: space-y-3, p-4
- Input: sticky bottom-0, h-12

---

This system prioritizes **speed and clarity** for sales reps managing high volumes of leads. Every component supports the goal of frictionless activity logging and data-driven follow-up discipline.