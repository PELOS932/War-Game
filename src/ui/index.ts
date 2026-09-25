/**
 * UI entry points (contract in ./api.ts):
 *   showMainMenu, showLoadingScreen, showNationSelect, createGameUI
 */
import './styles.css';
import type { CreateGameUI, ShowLoadingScreen, ShowMainMenu, ShowNationSelect } from './api';
import { showMainMenu as mainMenu, showLoadingScreen as loadingScreen } from './menu';
import { showNationSelect as nationSelect } from './nationSelect';
import { createGameUI as gameUI } from './game/hud';

export const showMainMenu: ShowMainMenu = mainMenu;
export const showLoadingScreen: ShowLoadingScreen = loadingScreen;
export const showNationSelect: ShowNationSelect = nationSelect;
export const createGameUI: CreateGameUI = gameUI;

export type { GameUI, LoadingScreen, MainMenuCallbacks } from './api';
