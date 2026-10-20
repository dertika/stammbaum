import type { Model } from '../gramps/model.ts'
import { project, type Projection, type ViewOptions } from './project.ts'

/**
 * Merkt sich Projektionen je Datenstand und Optionen, damit nicht jede
 * Anfrage den ganzen Baum neu filtert.
 */
export class ProjectionCache {
  private model: Model | null = null
  private readonly entries = new Map<string, Projection>()

  get(model: Model, options: ViewOptions): Projection {
    if (model !== this.model) {
      this.model = model
      this.entries.clear()
    }
    const key = JSON.stringify([options.living, options.details, options.livingYears, options.rootGrampsId])
    let projection = this.entries.get(key)
    if (!projection) {
      projection = project(model, options)
      this.entries.set(key, projection)
    }
    return projection
  }
}
