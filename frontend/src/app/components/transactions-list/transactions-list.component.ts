import {
  Component,
  OnInit,
  Input,
  ChangeDetectionStrategy,
  OnChanges,
  ChangeDetectorRef,
  Output,
  EventEmitter,
} from '@angular/core';
import { StateService } from '../../services/state.service';
import { Observable, forkJoin } from 'rxjs';
import { Block, Outspend, Transaction } from '../../interfaces/electrs.interface';
import { ElectrsApiService } from '../../services/electrs-api.service';
import { environment } from 'src/environments/environment';
import { AssetsService } from 'src/app/services/assets.service';
import { map } from 'rxjs/operators';

@Component({
  selector: 'app-transactions-list',
  templateUrl: './transactions-list.component.html',
  styleUrls: ['./transactions-list.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TransactionsListComponent implements OnInit, OnChanges {
  network = '';
  nativeAssetId = environment.nativeAssetId;
  displayDetails = false;

  @Input() transactions: Transaction[];
  @Input() showConfirmations = false;
  @Input() transactionPage = false;

  @Output() loadMore = new EventEmitter();

  latestBlock$: Observable<Block>;
  outspends: Outspend[] = [];
  assetsMinimal: any;

  constructor(
    private stateService: StateService,
    private electrsApiService: ElectrsApiService,
    private assetsService: AssetsService,
    private ref: ChangeDetectorRef
  ) {}

  ngOnInit() {
    this.latestBlock$ = this.stateService.blocks$.pipe(map(([block]) => block));
    this.stateService.networkChanged$.subscribe(network => (this.network = network));

    if (this.network === 'liquid') {
      this.assetsService.getAssetsMinimalJson$.subscribe(assets => {
        this.assetsMinimal = assets;
      });
    }
  }

  ngOnChanges() {
    if (!this.transactions || !this.transactions.length) {
      return;
    }
    const observableObject = {};
    this.transactions.forEach((tx, i) => {
      tx['@voutLimit'] = true;
      tx['@vinLimit'] = true;
      if (this.outspends[i]) {
        return;
      }
      observableObject[i] = this.electrsApiService.getOutspends$(tx.txid);
    });

    forkJoin(observableObject).subscribe((outspends: any) => {
      const newOutspends = [];
      for (const i in outspends) {
        if (outspends.hasOwnProperty(i)) {
          newOutspends.push(outspends[i]);
        }
      }
      this.outspends = this.outspends.concat(newOutspends);
      this.ref.markForCheck();
    });
  }

  onScroll() {
    const scrollHeight = document.body.scrollHeight;
    const scrollTop = document.documentElement.scrollTop;
    if (scrollHeight > 0) {
      const percentageScrolled = (scrollTop * 100) / scrollHeight;
      if (percentageScrolled > 90) {
        this.loadMore.emit();
      }
    }
  }

  getTotalTxOutput(tx: Transaction) {
    return tx.vout.map((v: any) => v.value || 0).reduce((a: number, b: number) => a + b);
  }

  switchCurrency() {
    if (this.network === 'liquid') {
      return;
    }
    const oldvalue = !this.stateService.viewFiat$.value;
    this.stateService.viewFiat$.next(oldvalue);
  }

  trackByFn(index: number, tx: Transaction): string {
    return tx.txid + tx.status.confirmed;
  }

  trackByIndexFn(index: number) {
    return index;
  }

  formatHex(num: number): string {
    const str = num.toString(16);
    return '0x' + (str.length % 2 ? '0' : '') + str;
  }

  toggleDetails() {
    this.displayDetails = !this.displayDetails;
    this.ref.markForCheck();
  }
}
