
import { Like, ObjectLiteral, SelectQueryBuilder } from "typeorm/browser";





export class ApiFeature<T extends ObjectLiteral> {
    private queryBuilder: SelectQueryBuilder<T>;
    private query:any;
    constructor( qb: SelectQueryBuilder<T>, query:any) {
        this.queryBuilder = qb;
        this.query = query;
    }
    public build() : SelectQueryBuilder<T> {
        return this.queryBuilder;
    }
    public filter() : ApiFeature<T> {
        let minPrice:number|null = null;
        let maxPrice:number|null = null;
        console.log('query:', this.query);
        const queryObj = { ... this.query };
        console.log(queryObj);
        const excludeFields = ['page', 'sort', 'limit', 'field', 'relations'];
        excludeFields.forEach( el => delete queryObj[el]);
        console.log('++++++++++', queryObj);
        Object.keys(queryObj).forEach( key => {
            const value = queryObj[key];
            console.log('++++++++++', key, typeof(value));
            if ( typeof(value) === 'string' && key.includes('[') ) {
                 const realkey = key.replace('[gte]', '');
                if ( key.endsWith('[gte]') ) this.queryBuilder.andWhere(`${realkey} >= :${realkey}GTE`, { [`${realkey}GTE`]: value });
                else if ( key.endsWith('[gt]') ) this.queryBuilder.andWhere(`${realkey} > :${realkey}GT`, { [`${realkey}GT`]: value });
                else if ( key.endsWith('[lte]') ) this.queryBuilder.andWhere(`${realkey} <= :${realkey}LTE`, { [`${realkey}LTE`]: value });
                else if ( key.endsWith('[lt]') ) this.queryBuilder.andWhere(`${realkey} < :${realkey}LT`, { [`${realkey}LT`]: value });
                else if ( key.endsWith('[ne]') ) this.queryBuilder.andWhere(`${realkey} != :${realkey}NE`, { [`${realkey}NE`]: value });
                else if ( key.endsWith('[eq]') ) this.queryBuilder.andWhere(`${realkey} = :${realkey}EQ`, { [`${realkey}EQ`]: value });
                
    } else {
        
                    if (key ==='tittle'){
                        key = 'name';
                        this.queryBuilder.andWhere(`${key} LIKE :${key}`, { [key]: `%${value}%` });}
                    else if (key === 'minPrice') {
                        minPrice = Number(value);
                        }
                        else if (key === 'maxPrice') {
                        maxPrice = Number(value);
                        }
                    //console.log(this.queryBuilder)
                }
    })  
     if (minPrice !== null && maxPrice !== null) {
    this.queryBuilder.andWhere(
      `price BETWEEN :minPrice AND :maxPrice`,
      { minPrice, maxPrice } 
    )};
        return this;
    }
    public sort() :ApiFeature<T> {
        
        console.log('Sorting by 1 ', typeof this.query.sort, this.query.sort.length);
        if ( this.query.sort ) {
        let fieldsArray:string[] = [];
        if ( typeof this.query.sort === 'string' ) {
            fieldsArray = this.query.sort.split(',');
        } else if ( Array.isArray(this.query.sort) ) {
            fieldsArray = this.query.sort;
        }
            fieldsArray.forEach( (field:string) => {
                console.log(field)
                let order: 'ASC' | 'DESC' = 'ASC';
                if ( field.startsWith('-') ) {
                    console.log('Descending order');
                    order = 'DESC';
                    field = field.substring(1);
                }
                this.queryBuilder.addOrderBy(`${this.queryBuilder.alias}.${field}`, order);
            });
        }
            else {
                console.log('Default sort by createdAt DESC');
                this.queryBuilder.addOrderBy(`${this.queryBuilder.alias}.createdAt`, 'DESC');
            
               

            } 
               return this;
            }

        public field() : ApiFeature<T> {
            if ( this.query.field ) {
                let fields :string[] = [];
                if ( typeof this.query.field === 'string' ) {
                fields = this.query.field.split(',');
                console.log('fields:', fields);
        } else {
            fields = this.query.field.flatMap((item: string) => item.split(","));
        }
                this.queryBuilder.select(
      fields.map((field: string) => `${this.queryBuilder.alias}.${field}`)
    );
        
    }
    return this;
}

public paginate() {
    const page = Number(this.query.page) || 1;
    const dataPerPage = Number(this.query.limit) || 5;
    const skip = (page - 1) * dataPerPage;

    this.queryBuilder.skip(skip).take(dataPerPage);

    return this;
  }

  relations(relations: string[]) {
    relations.forEach(rel => {
      this.queryBuilder.leftJoinAndSelect(`product.${rel}`, rel);
    });

    return this;
  }
}