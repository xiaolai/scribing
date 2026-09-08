import Stroke from './Stroke';
import { CompiledUnit } from '../units/types';

export default class Character {
  unit?: CompiledUnit;
  symbol: string;
  strokes: Stroke[];

  constructor(symbol: string, strokes: Stroke[]) {
    this.symbol = symbol;
    this.strokes = strokes;
  }
}
