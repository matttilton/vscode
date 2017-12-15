/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vs/nls';
import * as types from 'vs/base/common/types';
import { ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { KeybindingsRegistry } from 'vs/platform/keybinding/common/keybindingsRegistry';
import { IEditorGroupService } from 'vs/workbench/services/group/common/groupService';
import { ActiveEditorMoveArguments, ActiveEditorMovePositioning, ActiveEditorMovePositioningBy, EditorCommands, TextCompareEditorVisible, IEditorContext, EditorInput } from 'vs/workbench/common/editor';
import { IWorkbenchEditorService } from 'vs/workbench/services/editor/common/editorService';
import { IEditor, Position, POSITIONS } from 'vs/platform/editor/common/editor';
import { EditorContextKeys } from 'vs/editor/common/editorContextKeys';
import { TextDiffEditor } from 'vs/workbench/browser/parts/editor/textDiffEditor';
import { EditorStacksModel } from 'vs/workbench/common/editor/editorStacksModel';
import { ICommandService, CommandsRegistry } from 'vs/platform/commands/common/commands';
import { IMessageService, Severity, CloseAction } from 'vs/platform/message/common/message';
import { Action } from 'vs/base/common/actions';
import { KeyMod, KeyCode } from 'vs/base/common/keyCodes';
import { TPromise } from 'vs/base/common/winjs.base';
import { MenuRegistry, MenuId } from 'vs/platform/actions/common/actions';

export const CLOSE_UNMODIFIED_EDITORS_COMMAND_ID = 'workbench.command.closeUnmodifiedEditors';
export const CLOSE_UNMODIFIED_EDITORS_LABEL = nls.localize('closeUnmodifiedEditors', "Close Unmodified Editors in Group");

export const CLOSE_EDITORS_IN_GROUP_COMMAND_ID = 'workbench.command.closeEditorsInGroup';
export const CLOSE_EDITORS_IN_GROUP_LABEL = nls.localize('closeEditorsInGroup', "Close All Editors in Group");

export const CLOSE_EDITOR_COMMAND_ID = 'workbench.command.closeActiveEditor';
export const CLOSE_EDITOR_LABEL = nls.localize('closeEditor', "Close Editor");

export const CLOSE_OTHER_EDITORS_IN_GROUP_COMMAND_ID = 'workbench.command.closeOtherEditors';
export const CLOSE_OTHER_EDITORS_IN_GROUP_LABEL = nls.localize('closeOtherEditorsInGroup', "Close Other Editors");


export function setup(): void {
	registerActiveEditorMoveCommand();
	registerDiffEditorCommands();
	registerOpenEditorAtIndexCommands();
	registerEditorCommands();
	handleCommandDeprecations();
}

const isActiveEditorMoveArg = function (arg: ActiveEditorMoveArguments): boolean {
	if (!types.isObject(arg)) {
		return false;
	}

	const activeEditorMoveArg: ActiveEditorMoveArguments = arg;

	if (!types.isString(activeEditorMoveArg.to)) {
		return false;
	}

	if (!types.isUndefined(activeEditorMoveArg.by) && !types.isString(activeEditorMoveArg.by)) {
		return false;
	}

	if (!types.isUndefined(activeEditorMoveArg.value) && !types.isNumber(activeEditorMoveArg.value)) {
		return false;
	}

	return true;
};

function registerActiveEditorMoveCommand(): void {
	KeybindingsRegistry.registerCommandAndKeybindingRule({
		id: EditorCommands.MoveActiveEditor,
		weight: KeybindingsRegistry.WEIGHT.workbenchContrib(),
		when: EditorContextKeys.textFocus,
		primary: null,
		handler: (accessor, args: any) => moveActiveEditor(args, accessor),
		description: {
			description: nls.localize('editorCommand.activeEditorMove.description', "Move the active editor by tabs or groups"),
			args: [
				{
					name: nls.localize('editorCommand.activeEditorMove.arg.name', "Active editor move argument"),
					description: nls.localize('editorCommand.activeEditorMove.arg.description', "Argument Properties:\n\t* 'to': String value providing where to move.\n\t* 'by': String value providing the unit for move. By tab or by group.\n\t* 'value': Number value providing how many positions or an absolute position to move."),
					constraint: isActiveEditorMoveArg
				}
			]
		}
	});
}

function moveActiveEditor(args: ActiveEditorMoveArguments = {}, accessor: ServicesAccessor): void {
	const showTabs = accessor.get(IEditorGroupService).getTabOptions().showTabs;
	args.to = args.to || ActiveEditorMovePositioning.RIGHT;
	args.by = showTabs ? args.by || ActiveEditorMovePositioningBy.TAB : ActiveEditorMovePositioningBy.GROUP;
	args.value = types.isUndefined(args.value) ? 1 : args.value;

	const activeEditor = accessor.get(IWorkbenchEditorService).getActiveEditor();
	if (activeEditor) {
		switch (args.by) {
			case ActiveEditorMovePositioningBy.TAB:
				return moveActiveTab(args, activeEditor, accessor);
			case ActiveEditorMovePositioningBy.GROUP:
				return moveActiveEditorToGroup(args, activeEditor, accessor);
		}
	}
}

function moveActiveTab(args: ActiveEditorMoveArguments, activeEditor: IEditor, accessor: ServicesAccessor): void {
	const editorGroupsService: IEditorGroupService = accessor.get(IEditorGroupService);
	const editorGroup = editorGroupsService.getStacksModel().groupAt(activeEditor.position);
	let index = editorGroup.indexOf(activeEditor.input);
	switch (args.to) {
		case ActiveEditorMovePositioning.FIRST:
			index = 0;
			break;
		case ActiveEditorMovePositioning.LAST:
			index = editorGroup.count - 1;
			break;
		case ActiveEditorMovePositioning.LEFT:
			index = index - args.value;
			break;
		case ActiveEditorMovePositioning.RIGHT:
			index = index + args.value;
			break;
		case ActiveEditorMovePositioning.CENTER:
			index = Math.round(editorGroup.count / 2) - 1;
			break;
		case ActiveEditorMovePositioning.POSITION:
			index = args.value - 1;
			break;
	}

	index = index < 0 ? 0 : index >= editorGroup.count ? editorGroup.count - 1 : index;
	editorGroupsService.moveEditor(activeEditor.input, editorGroup, editorGroup, { index });
}

function moveActiveEditorToGroup(args: ActiveEditorMoveArguments, activeEditor: IEditor, accessor: ServicesAccessor): void {
	let newPosition = activeEditor.position;
	switch (args.to) {
		case ActiveEditorMovePositioning.LEFT:
			newPosition = newPosition - 1;
			break;
		case ActiveEditorMovePositioning.RIGHT:
			newPosition = newPosition + 1;
			break;
		case ActiveEditorMovePositioning.FIRST:
			newPosition = Position.ONE;
			break;
		case ActiveEditorMovePositioning.LAST:
			newPosition = Position.THREE;
			break;
		case ActiveEditorMovePositioning.CENTER:
			newPosition = Position.TWO;
			break;
		case ActiveEditorMovePositioning.POSITION:
			newPosition = args.value - 1;
			break;
	}

	newPosition = POSITIONS.indexOf(newPosition) !== -1 ? newPosition : activeEditor.position;
	accessor.get(IEditorGroupService).moveEditor(activeEditor.input, activeEditor.position, newPosition);
}

function registerDiffEditorCommands(): void {
	KeybindingsRegistry.registerCommandAndKeybindingRule({
		id: 'workbench.action.compareEditor.nextChange',
		weight: KeybindingsRegistry.WEIGHT.workbenchContrib(),
		when: TextCompareEditorVisible,
		primary: null,
		handler: accessor => navigateInDiffEditor(accessor, true)
	});

	KeybindingsRegistry.registerCommandAndKeybindingRule({
		id: 'workbench.action.compareEditor.previousChange',
		weight: KeybindingsRegistry.WEIGHT.workbenchContrib(),
		when: TextCompareEditorVisible,
		primary: null,
		handler: accessor => navigateInDiffEditor(accessor, false)
	});

	function navigateInDiffEditor(accessor: ServicesAccessor, next: boolean): void {
		let editorService = accessor.get(IWorkbenchEditorService);
		const candidates = [editorService.getActiveEditor(), ...editorService.getVisibleEditors()].filter(e => e instanceof TextDiffEditor);

		if (candidates.length > 0) {
			next ? (<TextDiffEditor>candidates[0]).getDiffNavigator().next() : (<TextDiffEditor>candidates[0]).getDiffNavigator().previous();
		}
	}

	KeybindingsRegistry.registerCommandAndKeybindingRule({
		id: '_workbench.printStacksModel',
		weight: KeybindingsRegistry.WEIGHT.workbenchContrib(0),
		handler(accessor: ServicesAccessor) {
			console.log(`${accessor.get(IEditorGroupService).getStacksModel().toString()}\n\n`);
		},
		when: undefined,
		primary: undefined
	});

	KeybindingsRegistry.registerCommandAndKeybindingRule({
		id: '_workbench.validateStacksModel',
		weight: KeybindingsRegistry.WEIGHT.workbenchContrib(0),
		handler(accessor: ServicesAccessor) {
			(<EditorStacksModel>accessor.get(IEditorGroupService).getStacksModel()).validate();
		},
		when: undefined,
		primary: undefined
	});
}

function handleCommandDeprecations(): void {
	const mapDeprecatedCommands = {
		'workbench.action.files.newFile': 'explorer.newFile',
		'workbench.action.files.newFolder': 'explorer.newFolder'
	};

	Object.keys(mapDeprecatedCommands).forEach(deprecatedCommandId => {
		const newCommandId: string = mapDeprecatedCommands[deprecatedCommandId];

		KeybindingsRegistry.registerCommandAndKeybindingRule({
			id: deprecatedCommandId,
			weight: KeybindingsRegistry.WEIGHT.workbenchContrib(0),
			handler(accessor: ServicesAccessor) {
				const messageService = accessor.get(IMessageService);
				const commandService = accessor.get(ICommandService);

				messageService.show(Severity.Warning, {
					message: nls.localize('commandDeprecated', "Command **{0}** has been removed. You can use **{1}** instead", deprecatedCommandId, newCommandId),
					actions: [
						new Action('openKeybindings', nls.localize('openKeybindings', "Configure Keyboard Shortcuts"), null, true, () => {
							return commandService.executeCommand('workbench.action.openGlobalKeybindings');
						}),
						CloseAction
					]
				});
			},
			when: undefined,
			primary: undefined
		});
	});
}

function registerOpenEditorAtIndexCommands(): void {

	// Keybindings to focus a specific index in the tab folder if tabs are enabled
	for (let i = 0; i < 9; i++) {
		const editorIndex = i;
		const visibleIndex = i + 1;

		KeybindingsRegistry.registerCommandAndKeybindingRule({
			id: 'workbench.action.openEditorAtIndex' + visibleIndex,
			weight: KeybindingsRegistry.WEIGHT.workbenchContrib(),
			when: void 0,
			primary: KeyMod.Alt | toKeyCode(visibleIndex),
			mac: { primary: KeyMod.WinCtrl | toKeyCode(visibleIndex) },
			handler: accessor => {
				const editorService = accessor.get(IWorkbenchEditorService);
				const editorGroupService = accessor.get(IEditorGroupService);

				const active = editorService.getActiveEditor();
				if (active) {
					const group = editorGroupService.getStacksModel().groupAt(active.position);
					const editor = group.getEditor(editorIndex);

					if (editor) {
						return editorService.openEditor(editor);
					}
				}

				return void 0;
			}
		});
	}

	function toKeyCode(index: number): KeyCode {
		switch (index) {
			case 0: return KeyCode.KEY_0;
			case 1: return KeyCode.KEY_1;
			case 2: return KeyCode.KEY_2;
			case 3: return KeyCode.KEY_3;
			case 4: return KeyCode.KEY_4;
			case 5: return KeyCode.KEY_5;
			case 6: return KeyCode.KEY_6;
			case 7: return KeyCode.KEY_7;
			case 8: return KeyCode.KEY_8;
			case 9: return KeyCode.KEY_9;
		}

		return void 0;
	}
}

function registerEditorCommands() {

	CommandsRegistry.registerCommand({
		id: CLOSE_UNMODIFIED_EDITORS_COMMAND_ID,
		handler: (accessor, args: IEditorContext) => {
			const editorGroupService = accessor.get(IEditorGroupService);
			const editorService = accessor.get(IWorkbenchEditorService);

			let position = args ? editorGroupService.getStacksModel().positionOfGroup(args.group) : null;

			// If position is not passed in take the position of the active editor.
			if (typeof position !== 'number') {
				const active = editorService.getActiveEditor();
				if (active) {
					position = active.position;
				}
			}

			if (typeof position === 'number') {
				return editorService.closeEditors(position, { unmodifiedOnly: true });
			}

			return TPromise.as(false);
		}
	});

	MenuRegistry.appendMenuItem(MenuId.OpenEditorsContext, {
		group: 'close',
		command: {
			id: CLOSE_UNMODIFIED_EDITORS_COMMAND_ID,
			title: CLOSE_UNMODIFIED_EDITORS_LABEL
		}
	});

	CommandsRegistry.registerCommand({
		id: CLOSE_EDITORS_IN_GROUP_COMMAND_ID,
		handler: (accessor, args: IEditorContext) => {
			const editorGroupService = accessor.get(IEditorGroupService);
			const editorService = accessor.get(IWorkbenchEditorService);

			let position = args ? editorGroupService.getStacksModel().positionOfGroup(args.group) : null;
			if (typeof position !== 'number') {
				const activeEditor = editorService.getActiveEditor();
				if (activeEditor) {
					position = activeEditor.position;
				}
			}

			if (typeof position === 'number') {
				return editorService.closeEditors(position);
			}

			return TPromise.as(false);
		}
	});

	MenuRegistry.appendMenuItem(MenuId.OpenEditorsContext, {
		group: 'close',
		command: {
			id: CLOSE_EDITORS_IN_GROUP_COMMAND_ID,
			title: CLOSE_EDITORS_IN_GROUP_LABEL
		}
	});

	CommandsRegistry.registerCommand({
		id: CLOSE_EDITOR_COMMAND_ID,
		handler: (accessor, args: IEditorContext) => {
			const editorGroupService = accessor.get(IEditorGroupService);
			const editorService = accessor.get(IWorkbenchEditorService);

			const position = args ? editorGroupService.getStacksModel().positionOfGroup(args.group) : null;

			// Close Active Editor
			if (typeof position !== 'number') {
				const activeEditor = editorService.getActiveEditor();
				if (activeEditor) {
					return editorService.closeEditor(activeEditor.position, activeEditor.input);
				}
			}

			let input = args ? args.editor : null;
			if (!input) {

				// Get Top Editor at Position
				const visibleEditors = editorService.getVisibleEditors();
				if (visibleEditors[position]) {
					input = visibleEditors[position].input;
				}
			}

			if (input) {
				return editorService.closeEditor(position, input);
			}

			return TPromise.as(false);
		}
	});

	MenuRegistry.appendMenuItem(MenuId.OpenEditorsContext, {
		group: 'close',
		command: {
			id: CLOSE_EDITOR_COMMAND_ID,
			title: CLOSE_EDITOR_LABEL
		}
	});

	CommandsRegistry.registerCommand({
		id: CLOSE_OTHER_EDITORS_IN_GROUP_COMMAND_ID,
		handler: (accessor, args: IEditorContext) => {
			const editorGroupService = accessor.get(IEditorGroupService);
			const editorService = accessor.get(IWorkbenchEditorService);

			let position = args ? editorGroupService.getStacksModel().positionOfGroup(args.group) : null;
			let input = args ? args.editor : null;

			// If position or input are not passed in take the position and input of the active editor.
			const active = editorService.getActiveEditor();
			if (active) {
				position = typeof position === 'number' ? position : active.position;
				input = input ? input : <EditorInput>active.input;
			}

			if (typeof position === 'number' && input) {
				return editorService.closeEditors(position, { except: input });
			}

			return TPromise.as(false);
		}
	});

	MenuRegistry.appendMenuItem(MenuId.OpenEditorsContext, {
		group: 'close',
		command: {
			id: CLOSE_OTHER_EDITORS_IN_GROUP_COMMAND_ID,
			title: CLOSE_OTHER_EDITORS_IN_GROUP_LABEL
		}
	});
}
