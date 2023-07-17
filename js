
import sys
import pandas as pd
import numpy as np
from sqlalchemy import create_engine,text, bindparam, insert
import concurrent.futures
import gc
gc.enable()


SERVER_NAME ='DEVCONTWCOR01.r1rcm.tech'
DATABASE ='Srdial'
DRIVER = 'SQL+Server'
TABLE_NAME = 'MFS_Export_GenesysRaw'
FTP = 'C:/Users/IN10011418/OneDrive - R1/Desktop/MFS-Test.csv'
MAX_THREADS = 25
CHUNK_SIZE = 100000


insert_records_failure_flag_counter = 0
rows_inserted = 0
insertion_err = ''
insert_records_failure_flag = True

try:
    ENGINE = create_engine(f'mssql+pyodbc://{SERVER_NAME}/{DATABASE}?driver={DRIVER}',fast_executemany=True)

except Exception as e:

    print(f"Unable to connect to server :: {SERVER_NAME} err_msg :: {e}.")


def insert_records(chunk):

    try:
        global rows_inserted, insert_records_failure_flag,insertion_err,insert_records_failure_flag_counter

        cnx = ENGINE.connect()

        chunk = chunk.rename(columns=lambda x: x.replace('-', ''))
        chunk.fillna('NULL', inplace=True)

        float_columns = chunk.select_dtypes(include='float').columns
        chunk[float_columns] = chunk[float_columns].replace([np.inf, -np.inf], np.nan)
        chunk[float_columns] = chunk[float_columns].astype(pd.Int64Dtype())

        insert_query = f"INSERT INTO {TABLE_NAME} ({', '.join(chunk.columns)}) VALUES ({', '.join([':' + col for col in chunk.columns])})"

        with cnx.begin() as transaction:
            stmt = text(insert_query)
            stmt = stmt.bindparams(*[bindparam(col) for col in chunk.columns])
            cnx.execute(stmt, chunk.to_dict(orient='records'))
            transaction.commit()
        
        cnx.close()
        rows_inserted += len(chunk)

    except Exception as e:

        insertion_err += str(e)

        insert_records_failure_flag_counter += 1

        print(f"Unable to insert data in table :: {TABLE_NAME}. err_msg :: {insertion_err}")


def create_chunk(df):

    global insertion_err

    chunks = [df[i:i+CHUNK_SIZE] for i in range(0, len(df), CHUNK_SIZE)]

    with concurrent.futures.ThreadPoolExecutor(max_workers=MAX_THREADS) as executor:

        futures = []

        print(f"Inserting data into table :: {TABLE_NAME}.")

        for chunk in chunks:
            future = executor.submit(insert_records,chunk)
            futures.append(future)

        for future in concurrent.futures.as_completed(futures):
            print(future)

    print(f"Total number of rows inserted :: {rows_inserted}.")


if __name__ == '__main__':

    matching_file = FTP

    if matching_file:
        df = pd.read_csv(matching_file,sep=',', low_memory=False)
        
        create_chunk(df)

    else:
        
        print("No file found. Sys exit.")
        sys.exit(1) 
        
'''
['inin-outbound-id', 'cqRecordId', 'cqCampName', 'cqCampId', 'cqCampOrder', 'cqSourceDB', 'cqAppName', 'cqAppRecordId', 'cqFacility', 'cqAccountNum', 'cqFirstName', 'cqLastName', 'cqStateCode', 'cqZipCode', 'cqPhoneHome', 'cqPhoneWork', 'cqPhoneMobile', 'cqTimeZoneCode', 'cqDayLightFlag', 'cqFlag', 'cqNotes', 'cqDestination', 'WeightScore', 'ContactCallable', 'ContactableByVoice', 'ContactableBySms', 'ContactableByEmail', 'ZipCodeAutomaticTimeZone', 'CallRecordLastAttempt-cqPhoneHome', 'CallRecordLastResult-cqPhoneHome', 'CallRecordLastAgentWrapup-cqPhoneHome', 'SmsLastAttempt-cqPhoneHome', 'SmsLastResult-cqPhoneHome', 'Callable-cqPhoneHome', 'ContactableByVoice-cqPhoneHome', 'ContactableBySms-cqPhoneHome', 'AutomaticTimeZone-cqPhoneHome', 'CallRecordLastAttempt-cqPhoneWork', 'CallRecordLastResult-cqPhoneWork', 'CallRecordLastAgentWrapup-cqPhoneWork', 'SmsLastAttempt-cqPhoneWork', 'SmsLastResult-cqPhoneWork', 'Callable-cqPhoneWork', 'ContactableByVoice-cqPhoneWork', 'ContactableBySms-cqPhoneWork', 'AutomaticTimeZone-cqPhoneWork', 'CallRecordLastAttempt-cqPhoneMobile', 'CallRecordLastResult-cqPhoneMobile', 'CallRecordLastAgentWrapup-cqPhoneMobile', 'SmsLastAttempt-cqPhoneMobile', 'SmsLastResult-cqPhoneMobile', 'Callable-cqPhoneMobile', 'ContactableByVoice-cqPhoneMobile', 'ContactableBySms-cqPhoneMobile', 'AutomaticTimeZone-cqPhoneMobile']
Inserting data into table :: MFS_Export_GenesysRaw.
'''
