import {
  AuditEntry,
  ColorGroup,
  LegalEntity,
  LifecycleChange,
  ProductStyle,
  SizeGroup,
} from '../models/types'
import { EnrichPatch, ProductService } from './productService'

/**
 * Documented stub for the live D365 F&SC integration (same approach as the
 * Consignment app's LiveD365Service). Wiring requires an OAuth client
 * (Entra ID app registration) and the OData endpoints below — see
 * docs/FUTURE-INTEGRATION.md:
 *
 *   styles / masters ......... EcoResProductMasterV2, EcoResReleasedProductV2
 *   size & color groups ...... EcoResProductSizes, EcoResProductColors,
 *                              size/color group entities
 *   variants / release ....... EcoResProductVariantsV2 + release-to-legal-entity
 *                              (ReleaseProduct action per dataAreaId)
 *   lifecycle ................ ProdLifecycleState on the released product;
 *                              future dating via a scheduled change record
 *   vendor / COO / HTS ....... DefaultOrderSettings, InventTable extensions,
 *                              CustomsTariffCodes
 *   audit .................... Database log / custom change-log entity
 */
export class LiveProductService implements ProductService {
  readonly live = true

  private nope(): never {
    throw new Error(
      'Live D365 connection is not configured in this demo build. ' +
        'Switch back to sample data in Setup, or see docs/FUTURE-INTEGRATION.md.',
    )
  }

  async getStyles(): Promise<ProductStyle[]> { this.nope() }
  async getLegalEntities(): Promise<LegalEntity[]> { this.nope() }
  async getSizeGroups(): Promise<SizeGroup[]> { this.nope() }
  async getColorGroups(): Promise<ColorGroup[]> { this.nope() }
  async getAudit(_styleNumber?: string): Promise<AuditEntry[]> { this.nope() }
  async enrichStyle(_s: string, _p: EnrichPatch, _u: string): Promise<ProductStyle> { this.nope() }
  async addVariants(_s: string, _sz: string[], _c: string[], _e: string[], _u: string): Promise<ProductStyle> { this.nope() }
  async setLifecycle(_s: string, _c: LifecycleChange, _u: string): Promise<ProductStyle> { this.nope() }
  async releaseToEntities(_s: string, _e: string[], _u: string): Promise<ProductStyle> { this.nope() }
  async revalidate(_s: string, _u: string): Promise<ProductStyle> { this.nope() }
}
